use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::StreamExt;
use reqwest::{multipart, Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const API_KEY_ENV: &str = "CREATIVE_OPENAI_API_KEY";
const FALLBACK_API_KEY_ENV: &str = "OPENAI_API_KEY";
const GENERATIONS_URL: &str = "https://api.openai.com/v1/images/generations";
const EDITS_URL: &str = "https://api.openai.com/v1/images/edits";
const MODEL: &str = "gpt-image-2";
const MAX_PROMPT_CHARS: usize = 4_000;
const MAX_REFERENCES: usize = 4;
const MAX_REFERENCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasGenerationStatus {
    configured: bool,
    provider: &'static str,
    model: &'static str,
    supports_references: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasReferenceImage {
    pub data: String,
    pub mime_type: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasGenerationRequest {
    pub prompt: String,
    #[serde(default)]
    pub references: Vec<CanvasReferenceImage>,
    pub count: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedCanvasImage {
    pub data: String,
    pub mime_type: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasGenerationResponse {
    pub images: Vec<GeneratedCanvasImage>,
    pub model: &'static str,
}

#[derive(Debug, Deserialize)]
struct OpenAiImagesResponse {
    data: Vec<OpenAiImage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiImage {
    b64_json: String,
}

struct ValidatedReference {
    bytes: Vec<u8>,
    mime_type: String,
    name: String,
}

fn api_key() -> Option<String> {
    [API_KEY_ENV, FALLBACK_API_KEY_ENV].iter().find_map(|name| {
        std::env::var(name)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    })
}

fn has_expected_image_signature(mime_type: &str, bytes: &[u8]) -> bool {
    match mime_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn validate_request(
    request: CanvasGenerationRequest,
) -> Result<(String, u8, Vec<ValidatedReference>), String> {
    let prompt = request.prompt.trim().to_owned();
    let prompt_chars = prompt.chars().count();
    if prompt_chars == 0 || prompt_chars > MAX_PROMPT_CHARS {
        return Err(format!(
            "Prompt must contain between 1 and {MAX_PROMPT_CHARS} characters."
        ));
    }
    if !(1..=4).contains(&request.count) {
        return Err("Image count must be between 1 and 4.".to_owned());
    }
    if request.references.len() > MAX_REFERENCES {
        return Err(format!(
            "At most {MAX_REFERENCES} reference images are allowed."
        ));
    }

    let references = request
        .references
        .into_iter()
        .map(|reference| {
            if !matches!(
                reference.mime_type.as_str(),
                "image/png" | "image/jpeg" | "image/webp"
            ) {
                return Err("Reference images must be PNG, JPEG, or WebP.".to_owned());
            }
            let encoded = reference.data.trim();
            if encoded.len() > (MAX_REFERENCE_BYTES * 4 / 3) + 8 {
                return Err(format!(
                    "Each reference image must contain at most {MAX_REFERENCE_BYTES} decoded bytes."
                ));
            }
            let bytes = BASE64
                .decode(encoded)
                .map_err(|_| "Reference image data is not valid base64.".to_owned())?;
            if bytes.is_empty() || bytes.len() > MAX_REFERENCE_BYTES {
                return Err(format!(
                    "Each reference image must contain 1 to {MAX_REFERENCE_BYTES} decoded bytes."
                ));
            }
            if !has_expected_image_signature(&reference.mime_type, &bytes) {
                return Err("Reference image data does not match its MIME type.".to_owned());
            }
            let name = reference.name.trim();
            if name.is_empty() || name.chars().count() > 200 {
                return Err("Reference image names must contain 1 to 200 characters.".to_owned());
            }
            Ok(ValidatedReference {
                bytes,
                mime_type: reference.mime_type,
                name: name.to_owned(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok((prompt, request.count, references))
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(300))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize the image generation client.".to_owned())
}

async fn decode_response(response: reqwest::Response) -> Result<CanvasGenerationResponse, String> {
    let status = response.status();
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if status != StatusCode::OK {
        let suffix = request_id
            .as_deref()
            .map(|id| format!(" Request id: {id}."))
            .unwrap_or_default();
        return Err(format!(
            "Image generation provider returned HTTP {}.{}",
            status.as_u16(),
            suffix
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return Err("Image generation response exceeded the size limit.".to_owned());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| "Could not read the image generation response.".to_owned())?;
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("Image generation response exceeded the size limit.".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    let parsed: OpenAiImagesResponse = serde_json::from_slice(&bytes)
        .map_err(|_| "Image generation provider returned an invalid response.".to_owned())?;
    if parsed.data.is_empty() || parsed.data.len() > 4 {
        return Err("Image generation provider returned an unexpected image count.".to_owned());
    }
    for image in &parsed.data {
        BASE64
            .decode(&image.b64_json)
            .map_err(|_| "Image generation provider returned invalid image data.".to_owned())?;
    }
    Ok(CanvasGenerationResponse {
        images: parsed
            .data
            .into_iter()
            .map(|image| GeneratedCanvasImage {
                data: image.b64_json,
                mime_type: "image/png",
            })
            .collect(),
        model: MODEL,
    })
}

#[tauri::command]
pub fn get_canvas_generation_status() -> CanvasGenerationStatus {
    CanvasGenerationStatus {
        configured: api_key().is_some(),
        provider: "OpenAI",
        model: MODEL,
        supports_references: true,
    }
}

#[tauri::command]
pub async fn generate_canvas_images(
    request: CanvasGenerationRequest,
) -> Result<CanvasGenerationResponse, String> {
    let key = api_key().ok_or_else(|| {
        format!(
            "Image generation is not configured. Set {API_KEY_ENV} (preferred) or {FALLBACK_API_KEY_ENV} before starting Berd."
        )
    })?;
    let (prompt, count, references) = validate_request(request)?;
    let client = client()?;
    let response = if references.is_empty() {
        client
            .post(GENERATIONS_URL)
            .bearer_auth(&key)
            .json(&serde_json::json!({
                "model": MODEL,
                "prompt": prompt,
                "n": count,
                "output_format": "png",
            }))
            .send()
            .await
    } else {
        let mut form = multipart::Form::new()
            .text("model", MODEL)
            .text("prompt", prompt)
            .text("n", count.to_string())
            .text("output_format", "png");
        for reference in references {
            let part = multipart::Part::bytes(reference.bytes)
                .file_name(reference.name)
                .mime_str(&reference.mime_type)
                .map_err(|_| "Reference image MIME type is invalid.".to_owned())?;
            form = form.part("image[]", part);
        }
        client
            .post(EDITS_URL)
            .bearer_auth(&key)
            .multipart(form)
            .send()
            .await
    }
    .map_err(|error| {
        if error.is_timeout() {
            "Image generation timed out.".to_owned()
        } else {
            "Could not reach the image generation provider.".to_owned()
        }
    })?;
    decode_response(response).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(prompt: &str, count: u8) -> CanvasGenerationRequest {
        CanvasGenerationRequest {
            prompt: prompt.to_owned(),
            references: Vec::new(),
            count,
        }
    }

    #[test]
    fn validates_prompt_and_count_bounds() {
        assert!(validate_request(request("", 1)).is_err());
        assert!(validate_request(request(&"x".repeat(MAX_PROMPT_CHARS + 1), 1)).is_err());
        assert!(validate_request(request("concept", 0)).is_err());
        assert!(validate_request(request("concept", 5)).is_err());
        assert!(validate_request(request("concept", 4)).is_ok());
    }

    #[test]
    fn validates_reference_count_type_and_decoded_size() {
        let mut too_many = request("concept", 1);
        too_many.references = (0..=MAX_REFERENCES)
            .map(|index| CanvasReferenceImage {
                data: BASE64.encode([index as u8]),
                mime_type: "image/png".to_owned(),
                name: format!("{index}.png"),
            })
            .collect();
        assert!(validate_request(too_many).is_err());

        let mut invalid_type = request("concept", 1);
        invalid_type.references.push(CanvasReferenceImage {
            data: BASE64.encode([1]),
            mime_type: "text/plain".to_owned(),
            name: "reference.txt".to_owned(),
        });
        assert!(validate_request(invalid_type).is_err());

        let mut invalid_data = request("concept", 1);
        invalid_data.references.push(CanvasReferenceImage {
            data: "not-base64".to_owned(),
            mime_type: "image/png".to_owned(),
            name: "reference.png".to_owned(),
        });
        assert!(validate_request(invalid_data).is_err());
    }
}

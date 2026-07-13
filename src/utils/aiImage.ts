// Downscale a picked photo before sending it to a vision model: full-size
// camera JPEGs are 3-8 MB, and uploading that base64 to Ollama Cloud dominates
// recognition latency. Food needs ~1024px; documents with small text ~1600px.
import * as ImageManipulator from 'expo-image-manipulator';

export async function toAiBase64(uri: string, maxWidth = 1024, compress = 0.6): Promise<string | null> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return resized.base64 ?? null;
}

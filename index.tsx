/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

const GEMINI_API_KEY = process.env.API_KEY;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

async function generateContent(
  prompt: string,
  imageBytes: string,
  numberOfVideos: number,
): Promise<string[]> {
  const ai = new GoogleGenAI({vertexai: false, apiKey: GEMINI_API_KEY});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png',
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log('Waiting for completion');
    await delay(1000);
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error('No videos generated');
  }

  const videoUrls = await Promise.all(
    videos.map(async (v) => {
      const url = decodeURIComponent(v.video.uri);
      const res = await fetch(url);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }),
  );

  return videoUrls;
}

const upload = document.querySelector('#file-input') as HTMLInputElement;
let base64data = '';
let prompt = '';

upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    base64data = await blobToBase64(file);
  }
});

const promptEl = document.querySelector('#prompt-input') as HTMLInputElement;
promptEl.addEventListener('change', async () => {
  prompt = promptEl.value;
});

const statusEl = document.querySelector('#status') as HTMLDivElement;
const videoContainer = document.querySelector(
  '#video-container',
) as HTMLDivElement;
const numVideosInput = document.querySelector(
  '#num-videos-input',
) as HTMLInputElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const openKeyEl = document.querySelector('#open-key') as HTMLButtonElement;

openKeyEl.addEventListener('click', async (e) => {
  await window.aistudio?.openSelectKey();
});

const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
generateButton.addEventListener('click', (e) => {
  generate();
});

async function generate() {
  statusEl.innerText = 'Generating...';
  videoContainer.innerHTML = '';

  generateButton.disabled = true;
  upload.disabled = true;
  promptEl.disabled = true;
  numVideosInput.disabled = true;
  quotaErrorEl.style.display = 'none';

  try {
    const numberOfVideos = parseInt(numVideosInput.value, 10);
    const videoUrls = await generateContent(prompt, base64data, numberOfVideos);

    videoUrls.forEach((url) => {
      const videoEl = document.createElement('video');
      videoEl.src = url;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.controls = true;
      videoContainer.appendChild(videoEl);
    });

    statusEl.innerText = 'Done.';
  } catch (e) {
    try {
      const err = JSON.parse(e.message);
      if (err.error.code === 429) {
        // Out of quota.
        quotaErrorEl.style.display = 'block';
        statusEl.innerText = '';
      } else {
        statusEl.innerText = err.error.message;
      }
    } catch (err) {
      statusEl.innerText = e.message;
      console.log('error', e.message);
    }
  }

  generateButton.disabled = false;
  upload.disabled = false;
  promptEl.disabled = false;
  numVideosInput.disabled = false;
}

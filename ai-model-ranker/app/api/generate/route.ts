import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

interface GenerateRequest {
  models: string[];
  prompt: string;
  images?: string[];
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

async function generateWithClaude(prompt: string, images: string[] = []): Promise<string> {
  try {
    const content: any[] = [];

    if (images.length > 0) {
      for (const img of images) {
        const base64Data = img.split(',')[1] || img;
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64Data,
          },
        });
      }
    }

    content.push({
      type: 'text',
      text: prompt,
    });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content,
      }],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    console.error('Claude error:', error);
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function generateWithGPT4(prompt: string, images: string[] = []): Promise<string> {
  try {
    const content: any[] = [{ type: 'text', text: prompt }];

    if (images.length > 0) {
      for (const img of images) {
        content.push({
          type: 'image_url',
          image_url: { url: img },
        });
      }
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content,
      }],
      max_tokens: 2048,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('GPT-4 error:', error);
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function generateWithGemini(prompt: string, images: string[] = [], modelName: string = 'gemini-1.5-pro'): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });

    const parts: any[] = [{ text: prompt }];

    if (images.length > 0) {
      for (const img of images) {
        const base64Data = img.split(',')[1] || img;
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg',
          },
        });
      }
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini error:', error);
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function generateWithModel(model: string, prompt: string, images: string[] = []): Promise<string> {
  switch (model) {
    case 'claude-3.5-sonnet':
      return generateWithClaude(prompt, images);
    case 'gpt-4o':
      return generateWithGPT4(prompt, images);
    case 'gemini-1.5-pro':
      return generateWithGemini(prompt, images, 'gemini-1.5-pro');
    case 'gemini-1.5-flash':
      return generateWithGemini(prompt, images, 'gemini-1.5-flash');
    case 'gpt-4o-mini':
      try {
        const content: any[] = [{ type: 'text', text: prompt }];
        if (images.length > 0) {
          for (const img of images) {
            content.push({ type: 'image_url', image_url: { url: img } });
          }
        }
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content }],
          max_tokens: 2048,
        });
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    default:
      return 'Model not supported';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { models, prompt, images = [] } = body;

    const results = await Promise.all(
      models.map(async (model) => ({
        model,
        response: await generateWithModel(model, prompt, images),
      }))
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

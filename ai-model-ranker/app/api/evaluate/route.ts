import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

interface EvaluateRequest {
  responses: Array<{ model: string; response: string }>;
  originalPrompt: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

async function evaluateWithModel(model: string, responses: Array<{ model: string; response: string }>, originalPrompt: string): Promise<any> {
  const evaluationPrompt = `You are an expert AI evaluator. Given the original prompt and multiple AI responses, score each response on a scale of 0-100 based on quality, clarity, relevance, and accuracy.

Original Prompt: ${originalPrompt}

Responses to evaluate:
${responses.map((r, i) => `\n[Response ${i + 1} from ${r.model}]:\n${r.response}`).join('\n\n')}

Provide your evaluation in JSON format:
{
  "scores": [
    {"model": "model_name", "score": 85, "reasoning": "brief explanation"},
    ...
  ]
}

Be objective and fair. Return ONLY the JSON, no additional text.`;

  try {
    let result = '';

    switch (model) {
      case 'claude-3.5-sonnet':
        const claudeMsg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          messages: [{ role: 'user', content: evaluationPrompt }],
        });
        result = claudeMsg.content[0].type === 'text' ? claudeMsg.content[0].text : '';
        break;

      case 'gpt-4o':
      case 'gpt-4o-mini':
        const gptResponse = await openai.chat.completions.create({
          model: model === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini',
          messages: [{ role: 'user', content: evaluationPrompt }],
          max_tokens: 2048,
        });
        result = gptResponse.choices[0]?.message?.content || '';
        break;

      case 'gemini-1.5-pro':
      case 'gemini-1.5-flash':
        const geminiModel = genAI.getGenerativeModel({
          model: model === 'gemini-1.5-pro' ? 'gemini-1.5-pro' : 'gemini-1.5-flash'
        });
        const geminiResult = await geminiModel.generateContent(evaluationPrompt);
        const geminiResponse = await geminiResult.response;
        result = geminiResponse.text();
        break;
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { scores: [] };
  } catch (error) {
    console.error(`Evaluation error with ${model}:`, error);
    return { scores: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function finalRankingWithGemini(topResponses: Array<{ model: string; response: string; avgScore: number }>, originalPrompt: string): Promise<any> {
  const rankingPrompt = `You are Gemini Pro performing a final independent ranking. Given the original prompt and the top 3 AI responses, rank them from best (1) to worst (3).

Original Prompt: ${originalPrompt}

Top Responses:
${topResponses.map((r, i) => `\n[Response ${i + 1} from ${r.model}] (Avg Score: ${r.avgScore.toFixed(1)}):\n${r.response}`).join('\n\n')}

Provide your final ranking in JSON format:
{
  "ranking": [
    {"rank": 1, "model": "model_name", "reasoning": "why this is the best"},
    {"rank": 2, "model": "model_name", "reasoning": "why this is second"},
    {"rank": 3, "model": "model_name", "reasoning": "why this is third"}
  ]
}

Return ONLY the JSON, no additional text.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(rankingPrompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { ranking: [] };
  } catch (error) {
    console.error('Final ranking error:', error);
    return { ranking: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: EvaluateRequest = await request.json();
    const { responses, originalPrompt } = body;

    // Cross-evaluation: each model evaluates all responses
    const evaluations = await Promise.all(
      responses.map(async (r) => ({
        evaluator: r.model,
        evaluation: await evaluateWithModel(r.model, responses, originalPrompt),
      }))
    );

    // Calculate average scores
    const scoreMap = new Map<string, number[]>();
    responses.forEach(r => scoreMap.set(r.model, []));

    evaluations.forEach(ev => {
      if (ev.evaluation.scores) {
        ev.evaluation.scores.forEach((score: any) => {
          if (scoreMap.has(score.model)) {
            scoreMap.get(score.model)!.push(score.score);
          }
        });
      }
    });

    const averageScores = responses.map(r => ({
      model: r.model,
      response: r.response,
      avgScore: scoreMap.get(r.model)!.length > 0
        ? scoreMap.get(r.model)!.reduce((a, b) => a + b, 0) / scoreMap.get(r.model)!.length
        : 0,
      scores: scoreMap.get(r.model)!,
    }));

    // Get top 3
    const topThree = averageScores
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3);

    // Final ranking by Gemini Pro
    const finalRanking = await finalRankingWithGemini(topThree, originalPrompt);

    return NextResponse.json({
      evaluations,
      averageScores,
      topThree,
      finalRanking,
    });
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

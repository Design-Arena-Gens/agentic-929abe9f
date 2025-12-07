'use client';

import { useState, useRef } from 'react';

const AVAILABLE_MODELS = [
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
];

interface Response {
  model: string;
  response: string;
}

interface EvaluationResult {
  evaluations: any[];
  averageScores: any[];
  topThree: any[];
  finalRanking: any;
}

export default function Home() {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [responses, setResponses] = useState<Response[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [userChoice, setUserChoice] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(m => m !== modelId)
        : prev.length < 5
        ? [...prev, modelId]
        : prev
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImages(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (selectedModels.length < 4 || !prompt.trim()) return;

    setLoading(true);
    setResponses([]);
    setEvaluation(null);
    setUserChoice('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: selectedModels,
          prompt,
          images,
        }),
      });

      const data = await res.json();
      setResponses(data.results);
    } catch (error) {
      console.error('Generation error:', error);
      alert('Error generating responses');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (responses.length === 0) return;

    setEvaluating(true);

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses,
          originalPrompt: prompt,
        }),
      });

      const data = await res.json();
      setEvaluation(data);
    } catch (error) {
      console.error('Evaluation error:', error);
      alert('Error evaluating responses');
    } finally {
      setEvaluating(false);
    }
  };

  const getModelName = (modelId: string) => {
    return AVAILABLE_MODELS.find(m => m.id === modelId)?.name || modelId;
  };

  const getAlignmentMessage = () => {
    if (!userChoice || !evaluation?.finalRanking?.ranking) return null;

    const geminiTop = evaluation.finalRanking.ranking[0]?.model;
    if (userChoice === geminiTop) {
      return <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded-lg text-green-800">
        <strong>Perfect Alignment!</strong> Your choice matches Gemini Pro&apos;s #1 ranking.
      </div>;
    }

    const userRank = evaluation.finalRanking.ranking.findIndex((r: any) => r.model === userChoice);
    if (userRank >= 0) {
      return <div className="mt-4 p-4 bg-yellow-100 border border-yellow-400 rounded-lg text-yellow-800">
        <strong>Partial Alignment:</strong> Your choice was ranked #{userRank + 1} by Gemini Pro.
      </div>;
    }

    return <div className="mt-4 p-4 bg-red-100 border border-red-400 rounded-lg text-red-800">
      <strong>Different Opinion:</strong> Your choice wasn&apos;t in Gemini Pro&apos;s top 3.
    </div>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400">
          AI Model Ranker
        </h1>
        <p className="text-center text-purple-300 mb-8">
          Test, compare, and rank multimodal AI responses
        </p>

        {/* Model Selection */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-semibold mb-4">Select 4-5 Models</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {AVAILABLE_MODELS.map(model => (
              <button
                key={model.id}
                onClick={() => toggleModel(model.id)}
                className={`p-4 rounded-lg font-medium transition-all ${
                  selectedModels.includes(model.id)
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 shadow-lg scale-105'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {model.name}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-purple-300">
            Selected: {selectedModels.length}/5
          </p>
        </div>

        {/* Prompt Input */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-semibold mb-4">Enter Your Prompt</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-32 bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your prompt here..."
          />

          {/* Image Upload */}
          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-all"
            >
              📷 Add Images (Optional)
            </button>

            {images.length > 0 && (
              <div className="mt-4 flex gap-4 flex-wrap">
                {images.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img src={img} alt={`Upload ${idx}`} className="w-24 h-24 object-cover rounded-lg" />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={selectedModels.length < 4 || !prompt.trim() || loading}
            className="mt-4 w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:from-gray-500 disabled:to-gray-600 px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Generating Responses...' : '🚀 Generate Responses'}
          </button>
        </div>

        {/* Responses */}
        {responses.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 shadow-2xl border border-white/20">
            <h2 className="text-2xl font-semibold mb-4">Model Responses</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {responses.map((resp, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <h3 className="font-bold text-lg mb-2 text-purple-300">
                    {getModelName(resp.model)}
                  </h3>
                  <div className="text-sm whitespace-pre-wrap bg-black/20 p-3 rounded max-h-64 overflow-y-auto">
                    {resp.response}
                  </div>
                </div>
              ))}
            </div>

            {!evaluation && (
              <button
                onClick={handleEvaluate}
                disabled={evaluating}
                className="mt-6 w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg disabled:cursor-not-allowed"
              >
                {evaluating ? '⏳ Evaluating & Ranking...' : '⭐ Evaluate & Rank Responses'}
              </button>
            )}
          </div>
        )}

        {/* Evaluation Results */}
        {evaluation && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 shadow-2xl border border-white/20">
            <h2 className="text-2xl font-semibold mb-4">Evaluation Results</h2>

            {/* Average Scores */}
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-3 text-purple-300">Cross-Evaluation Scores</h3>
              <div className="space-y-2">
                {evaluation.averageScores
                  .sort((a, b) => b.avgScore - a.avgScore)
                  .map((score, idx) => (
                    <div key={idx} className="bg-white/5 p-4 rounded-lg flex justify-between items-center">
                      <span className="font-semibold">{getModelName(score.model)}</span>
                      <div className="flex items-center gap-4">
                        <div className="w-48 bg-white/10 rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-pink-500 to-purple-500 h-full"
                            style={{ width: `${score.avgScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-lg">{score.avgScore.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Final Ranking */}
            {evaluation.finalRanking?.ranking && (
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-3 text-purple-300">
                  🏆 Gemini Pro Final Ranking
                </h3>
                <div className="space-y-3">
                  {evaluation.finalRanking.ranking.map((rank: any, idx: number) => (
                    <div
                      key={idx}
                      className={`bg-gradient-to-r p-4 rounded-lg ${
                        idx === 0
                          ? 'from-yellow-500/20 to-yellow-600/20 border-2 border-yellow-500'
                          : idx === 1
                          ? 'from-gray-400/20 to-gray-500/20 border-2 border-gray-400'
                          : 'from-orange-500/20 to-orange-600/20 border-2 border-orange-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl font-bold">#{rank.rank}</span>
                        <div className="flex-1">
                          <h4 className="font-bold text-lg">{getModelName(rank.model)}</h4>
                          <p className="text-sm text-purple-200 mt-1">{rank.reasoning}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Choice */}
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-3 text-purple-300">Your Choice</h3>
              <p className="mb-3 text-sm">Select your preferred response:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {responses.map((resp, idx) => (
                  <button
                    key={idx}
                    onClick={() => setUserChoice(resp.model)}
                    className={`p-4 rounded-lg text-left transition-all ${
                      userChoice === resp.model
                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 shadow-lg'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {getModelName(resp.model)}
                  </button>
                ))}
              </div>

              {userChoice && getAlignmentMessage()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { GoogleGenAI, Type } from "@google/genai";
import { Feedback, Question } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const feedbackSchema = {
    type: Type.OBJECT,
    properties: {
      relevance: { 
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "Score from 1-5" },
          feedback: { type: Type.STRING }
        }
      },
      starMethod: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "Score from 1-5" },
          feedback: { type: Type.STRING },
          situation: { type: Type.BOOLEAN },
          task: { type: Type.BOOLEAN },
          action: { type: Type.BOOLEAN },
          result: { type: Type.BOOLEAN }
        }
      },
      clarityConfidence: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "Score from 1-5" },
          feedback: { type: Type.STRING },
          powerWords: { type: Type.ARRAY, items: { type: Type.STRING } },
          passiveWords: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      },
      pace: {
        type: Type.OBJECT,
        properties: {
          wpm: { type: Type.NUMBER },
          feedback: { type: Type.STRING }
        }
      },
      fillerWords: {
        type: Type.OBJECT,
        properties: {
          count: { type: Type.NUMBER },
          words: { type: Type.ARRAY, items: { type: Type.STRING } },
          feedback: { type: Type.STRING }
        }
      },
      overallFeedback: { type: Type.STRING }
    }
};

export const generateQuestionsFromJD = async (jobDescription: string): Promise<string[]> => {
  const prompt = `You are an expert HR manager. Based on the following job description, generate a list of 5 relevant interview questions. The questions should cover a mix of behavioral, situational, and technical topics. Return the questions as a JSON array of strings.

    Job Description:
    ---
    ${jobDescription}
    ---
    `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
        },
      }
    }
  });

  const jsonText = response.text.trim();
  return JSON.parse(jsonText);
};

export const getAnswerFeedback = async (question: Question): Promise<Feedback> => {
    if (!question.answer) throw new Error("Answer is missing");

    const wordsPerMinute = question.audioDuration && question.answer 
      ? Math.round(question.answer.split(' ').length / (question.audioDuration / 60)) 
      : 150;

    const prompt = `You are a helpful, encouraging, and empathetic interview coach. Your audience may be facing barriers, so your tone must be unfailingly positive and constructive. Analyze the following interview question and the user's answer. 
    
    The user's answer was recorded at a pace of approximately ${wordsPerMinute} words per minute.

    Question: "${question.text}"
    Answer: "${question.answer}"

    Analyze the answer and provide feedback. A good speaking pace is between 140 and 160 WPM. Count occurrences of filler words like "um", "uh", "ah", "like", "you know", "so", "right". For behavioral questions, check for the STAR method. Identify power words vs. passive words. Finally, provide one single, actionable piece of constructive feedback, framed positively.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: feedbackSchema
      }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
};

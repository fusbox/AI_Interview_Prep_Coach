export enum InterviewState {
  NOT_STARTED = 'NOT_STARTED',
  GETTING_JOB_DESC = 'GETTING_JOB_DESC',
  GENERATING_QUESTIONS = 'GENERATING_QUESTIONS',
  INTERVIEWING = 'INTERVIEWING',
  AWAITING_FEEDBACK = 'AWAITING_FEEDBACK',
  REVIEWING = 'REVIEWING',
}

export interface Feedback {
  relevance: { score: number; feedback: string };
  starMethod: { score: number; feedback: string; situation: boolean; task: boolean; action: boolean; result: boolean };
  clarityConfidence: { score: number; feedback: string; powerWords: string[]; passiveWords: string[] };
  pace: { wpm: number; feedback: string };
  fillerWords: { count: number; words: string[]; feedback: string };
  overallFeedback: string;
}

export interface Question {
  id: number;
  text: string;
  answer?: string;
  feedback?: Feedback;
  audioDuration?: number;
}

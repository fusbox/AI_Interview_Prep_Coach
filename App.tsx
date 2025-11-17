import React, { useState, useEffect, useCallback, useRef } from 'react';
import { InterviewState, Question, Feedback } from './types';
import { generateQuestionsFromJD, getAnswerFeedback } from './services/geminiService';
import { MicIcon, StopCircleIcon, BotIcon, UserIcon, LoaderIcon, StarIcon, CheckCircleIcon, XCircleIcon, ClockIcon, RepeatIcon, SparklesIcon, LightbulbIcon } from './components/icons';

// Fix: Add TypeScript definitions for the Web Speech API to resolve compilation errors.
// --- Web Speech API type definitions for browsers that support it ---
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: Event) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const PRESET_QUESTIONS = [
  "Tell me about yourself.",
  "What are your biggest strengths?",
  "What are your biggest weaknesses?",
  "Tell me about a time you faced a challenge at work and how you handled it.",
  "Where do you see yourself in five years?"
];

// Helper components defined outside the main component
const StarRating: React.FC<{ score: number }> = ({ score }) => (
    <div className="flex text-yellow-400">
      {[...Array(5)].map((_, i) => (
        <StarIcon key={i} className={`h-5 w-5 ${i < score ? 'fill-current' : 'text-gray-300'}`} />
      ))}
    </div>
);

const FeedbackItem: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
    <div className="flex items-start space-x-3 rounded-lg bg-gray-50 p-3">
        <div className="flex-shrink-0 text-indigo-500">{icon}</div>
        <div>
            <p className="font-semibold text-gray-700">{label}</p>
            <div className="text-sm text-gray-600">{children}</div>
        </div>
    </div>
);

const App: React.FC = () => {
    const [interviewState, setInterviewState] = useState<InterviewState>(InterviewState.NOT_STARTED);
    const [jobDescription, setJobDescription] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    
    const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);

    // --- Speech Synthesis (TTS) ---
    const speak = useCallback((text: string, onEnd?: () => void) => {
        if (synthRef.current.speaking) {
            synthRef.current.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = synthRef.current.getVoices();
        // Find a natural-sounding voice
        utterance.voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        utterance.pitch = 1;
        utterance.rate = 1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            onEnd?.();
        };
        synthRef.current.speak(utterance);
    }, []);

    // --- Speech Recognition (STT) ---
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported.");
            return;
        }
        recognitionRef.current = new SpeechRecognition();
        const recognition = recognitionRef.current;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setInterimTranscript(interim);
            if (final) {
                setFinalTranscript(prev => prev + final + '. ');
            }
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const startListening = () => {
        if (recognitionRef.current) {
            setFinalTranscript('');
            setInterimTranscript('');
            setRecordingStartTime(Date.now());
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
            const endTime = Date.now();
            const duration = recordingStartTime ? (endTime - recordingStartTime) / 1000 : 0;
            
            setQuestions(prev => prev.map((q, i) => i === currentQuestionIndex ? { ...q, answer: finalTranscript, audioDuration: duration } : q));
            
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            } else {
                setInterviewState(InterviewState.AWAITING_FEEDBACK);
            }
        }
    };
    
    // --- Interview Flow Management ---
    const startInterview = async () => {
        setInterviewState(InterviewState.GENERATING_QUESTIONS);
        try {
            const generatedQs = jobDescription 
                ? await generateQuestionsFromJD(jobDescription) 
                : PRESET_QUESTIONS;
            
            setQuestions(generatedQs.map((q, i) => ({ id: i, text: q })));
            setCurrentQuestionIndex(0);
            setInterviewState(InterviewState.INTERVIEWING);
        } catch (error) {
            console.error("Failed to generate questions:", error);
            alert("Sorry, I couldn't generate questions right now. Let's use some common ones.");
            setQuestions(PRESET_QUESTIONS.map((q, i) => ({ id: i, text: q })));
            setCurrentQuestionIndex(0);
            setInterviewState(InterviewState.INTERVIEWING);
        }
    };
    
    useEffect(() => {
      if(interviewState === InterviewState.INTERVIEWING && questions.length > 0 && !isSpeaking && !isListening) {
          speak(questions[currentQuestionIndex].text);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewState, questions, currentQuestionIndex, speak]);
    
    useEffect(() => {
        if(interviewState === InterviewState.AWAITING_FEEDBACK) {
            const fetchFeedback = async () => {
                const questionsWithAnswers = questions.filter(q => q.answer);
                const updatedQuestions = [...questions];
                
                for(let i = 0; i < updatedQuestions.length; i++) {
                    if(updatedQuestions[i].answer) {
                        try {
                            const feedback = await getAnswerFeedback(updatedQuestions[i]);
                            updatedQuestions[i].feedback = feedback;
                            setQuestions([...updatedQuestions]); // Update state incrementally
                        } catch (error) {
                            console.error(`Failed to get feedback for question ${i}:`, error);
                        }
                    }
                }
                setInterviewState(InterviewState.REVIEWING);
            };
            fetchFeedback();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewState]);

    const resetInterview = () => {
        setInterviewState(InterviewState.NOT_STARTED);
        setJobDescription('');
        setQuestions([]);
        setCurrentQuestionIndex(0);
        setFinalTranscript('');
        setInterimTranscript('');
    }

    // --- Render Logic ---
    const renderContent = () => {
        switch(interviewState) {
            case InterviewState.NOT_STARTED:
                return (
                    <div className="text-center">
                        <h1 className="text-4xl font-bold text-gray-800 mb-2">AI Interview Coach</h1>
                        <p className="text-lg text-gray-600 mb-8">Practice your interview skills and get instant feedback.</p>
                        <div className="space-y-4">
                           <button onClick={() => setInterviewState(InterviewState.GETTING_JOB_DESC)} className="w-full max-w-sm bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:bg-indigo-700 transition-transform transform hover:scale-105">
                                Start with Job Description
                            </button>
                             <button onClick={startInterview} className="w-full max-w-sm bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-300 transition">
                                Use Common Questions
                            </button>
                        </div>
                    </div>
                );
            
            case InterviewState.GETTING_JOB_DESC:
                 return (
                    <div className="w-full max-w-2xl text-center">
                        <h2 className="text-3xl font-bold mb-4">Paste the Job Description</h2>
                        <p className="text-gray-600 mb-6">This will help me tailor the questions specifically for your role.</p>
                        <textarea 
                            className="w-full h-64 p-4 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                            placeholder="e.g., Responsibilities: Develop and maintain web applications..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                        />
                        <button onClick={startInterview} disabled={!jobDescription} className="mt-6 bg-indigo-600 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition">
                            Generate Questions & Start
                        </button>
                    </div>
                );

            case InterviewState.GENERATING_QUESTIONS:
                return (
                    <div className="text-center">
                        <LoaderIcon className="h-16 w-16 text-indigo-500 animate-spin mx-auto mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-700">Crafting your questions...</h2>
                        <p className="text-gray-500">This will just take a moment.</p>
                    </div>
                );

            case InterviewState.INTERVIEWING:
                const currentQ = questions[currentQuestionIndex];
                return (
                    <div className="w-full max-w-3xl flex flex-col items-center">
                        <div className="w-full bg-white p-8 rounded-xl shadow-lg mb-8">
                            <div className="flex items-start space-x-4">
                                <BotIcon className="h-8 w-8 text-indigo-500 flex-shrink-0 mt-1" />
                                <div>
                                    <p className="text-gray-500 font-medium">Question {currentQuestionIndex + 1} of {questions.length}</p>
                                    <p className="text-xl text-gray-800 font-semibold">{currentQ.text}</p>
                                </div>
                            </div>
                        </div>
                        { (interimTranscript || finalTranscript) &&
                          <div className="w-full bg-white p-6 rounded-xl shadow-lg mb-8 min-h-[100px]">
                            <p className="text-gray-600">
                                {finalTranscript}
                                <span className="text-indigo-400">{interimTranscript}</span>
                            </p>
                          </div>
                        }
                        <div className="flex flex-col items-center">
                             <button 
                                onClick={isListening ? stopListening : startListening}
                                disabled={isSpeaking}
                                className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'} ${isSpeaking ? 'bg-gray-400 cursor-not-allowed' : ''}`}>
                                {isListening ? <StopCircleIcon className="h-12 w-12 text-white" /> : <MicIcon className="h-12 w-12 text-white" />}
                                {isListening && <div className="absolute inset-0 rounded-full bg-red-400 opacity-75 animate-ping"></div>}
                            </button>
                            <p className="mt-4 text-gray-500 font-medium">{isListening ? "Recording... Click to stop" : (isSpeaking ? "Listen to the question..." : "Click to answer")}</p>
                        </div>
                    </div>
                );
            
            case InterviewState.AWAITING_FEEDBACK:
                 return (
                    <div className="text-center">
                        <LoaderIcon className="h-16 w-16 text-indigo-500 animate-spin mx-auto mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-700">Analyzing your performance...</h2>
                        <p className="text-gray-500">This is where the magic happens!</p>
                    </div>
                );

            case InterviewState.REVIEWING:
                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-10">
                            <h1 className="text-4xl font-bold text-gray-800 mb-2">Your Feedback Report</h1>
                            <p className="text-lg text-gray-600">Here's a breakdown of your performance. Great job practicing!</p>
                        </div>
                        <div className="space-y-8">
                            {questions.map((q) => (
                                <div key={q.id} className="bg-white p-6 rounded-xl shadow-lg">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Q: {q.text}</h3>
                                    <div className="flex items-start space-x-3 bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded-r-lg mb-4">
                                        <UserIcon className="h-5 w-5 text-indigo-700 flex-shrink-0 mt-1" />
                                        <p className="text-gray-700 italic">"{q.answer || 'No answer recorded.'}"</p>
                                    </div>
                                    
                                    {q.feedback ? (
                                        <div className="space-y-4">
                                             <FeedbackItem icon={<LightbulbIcon className="h-6 w-6" />} label="Overall Tip">
                                                <p className="font-medium text-indigo-800">{q.feedback.overallFeedback}</p>
                                            </FeedbackItem>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FeedbackItem icon={<SparklesIcon className="h-6 w-6"/>} label="Relevance & Clarity">
                                                    <StarRating score={q.feedback.relevance.score} />
                                                    <p>{q.feedback.relevance.feedback}</p>
                                                    <p className="mt-2 font-semibold">Confidence:</p>
                                                    <p>{q.feedback.clarityConfidence.feedback}</p>
                                                </FeedbackItem>
                                                <FeedbackItem icon={<StarIcon className="h-6 w-6"/>} label="STAR Method">
                                                    <StarRating score={q.feedback.starMethod.score} />
                                                    <p>{q.feedback.starMethod.feedback}</p>
                                                    <div className="flex space-x-2 mt-2 text-xs">
                                                        <span className={`px-2 py-1 rounded-full ${q.feedback.starMethod.situation ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>Situation</span>
                                                        <span className={`px-2 py-1 rounded-full ${q.feedback.starMethod.task ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>Task</span>
                                                        <span className={`px-2 py-1 rounded-full ${q.feedback.starMethod.action ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>Action</span>
                                                        <span className={`px-2 py-1 rounded-full ${q.feedback.starMethod.result ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>Result</span>
                                                    </div>
                                                </FeedbackItem>
                                                 <FeedbackItem icon={<ClockIcon className="h-6 w-6"/>} label="Pace">
                                                    <p><span className="font-bold text-2xl text-indigo-600">{q.feedback.pace.wpm}</span> WPM</p>
                                                    <p>{q.feedback.pace.feedback}</p>
                                                </FeedbackItem>
                                                <FeedbackItem icon={<MicIcon className="h-6 w-6"/>} label="Filler Words">
                                                     <p><span className="font-bold text-2xl text-indigo-600">{q.feedback.fillerWords.count}</span> found</p>
                                                     <p>{q.feedback.fillerWords.feedback}</p>
                                                     {q.feedback.fillerWords.count > 0 && <p className="text-xs text-gray-500 mt-1">e.g., "{q.feedback.fillerWords.words.slice(0, 3).join('", "')}"</p>}
                                                </FeedbackItem>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-gray-500">Feedback could not be generated for this answer.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="text-center mt-10">
                            <button onClick={resetInterview} className="bg-indigo-600 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:bg-indigo-700 transition flex items-center mx-auto">
                                <RepeatIcon className="h-5 w-5 mr-2"/>
                                Start a New Interview
                            </button>
                        </div>
                    </div>
                );
        }
    };
    
    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4 sm:p-6 lg:p-8">
            {renderContent()}
        </main>
    );
};

export default App;
'use client';
import { checkAndIntervene } from '@/lib/analyze-behavior';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, MicOff, Loader2, Volume2, User, Bot, Send } from 'lucide-react';
import { voiceAgent, textToSpeech, speechToText } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/language-context';

interface Message {
  role: 'user' | 'model';
  content: string;
}

export default function Home() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    audioPlayerRef.current = new Audio();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.preload = 'auto';
      audioPlayerRef.current.volume = 1.0;
    }
  }, []);

  const speakFallback = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isGeneratingAudio, isTranscribing]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);
// Screen message with .pkl model
const intervention = await checkAndIntervene(text);

if (intervention.shouldIntervene) {
  // Risk detected — skip normal AI, use crisis response
  const aiMessage: Message = { role: 'model', content: intervention.crisisResponse };
  setMessages(prev => [...prev, aiMessage]);
  
  setIsGeneratingAudio(true);
  const audioResult = await textToSpeech({ text: intervention.crisisResponse });
  setIsGeneratingAudio(false);
  
  if (audioResult.audioDataUri && audioPlayerRef.current) {
    audioPlayerRef.current.src = audioResult.audioDataUri;
    audioPlayerRef.current.play().catch(console.warn);
      } else {
        speakFallback(intervention.crisisResponse);
  }
  setIsLoading(false);
  return; // Skip normal voiceAgent() flow
}
    try {
      const response = await voiceAgent({
        history: newMessages,
        currentInput: text,
      });

      const aiMessage: Message = { role: 'model', content: response.response };
      setMessages(prev => [...prev, aiMessage]);

      setIsGeneratingAudio(true);
      const audioResult = await textToSpeech({ text: response.response });
      setIsGeneratingAudio(false);

      if (audioResult.audioDataUri) {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = audioResult.audioDataUri;
          audioPlayerRef.current.play().catch(e => {
            console.warn('Audio playback failed:', e);
            speakFallback(response.response);
          });
        }
      } else {
        speakFallback(response.response);
      }
    } catch (error) {
      console.error('Error with voice agent:', error);
      toast({
        variant: 'destructive',
        title: 'AI Agent Error',
        description: "I'm having trouble responding right now. Please try again.",
      });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [messages, toast]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputText);
  };

  const blobToDataUri = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const convertToWav = async (webmBlob: Blob): Promise<Blob> => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const wavBuffer = audioBufferToWav(audioBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(buffer.numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
    setUint16(buffer.numberOfChannels * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return arrayBuffer;
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size < 100) {
          toast({ variant: 'destructive', title: 'No audio detected', description: 'Please try speaking again.' });
          return;
        }

        // Transcribe using Gemini
        setIsTranscribing(true);
        try {
          // Convert WebM to WAV for better compatibility
          const wavBlob = await convertToWav(audioBlob);
          const audioDataUri = await blobToDataUri(wavBlob);
          const result = await speechToText({ audioDataUri });
          setIsTranscribing(false);

          if (result.transcript) {
            handleSendMessage(result.transcript);
          } else {
            toast({ variant: 'destructive', title: 'Could not transcribe', description: 'No speech was detected. Please try again.' });
          }
        } catch (err) {
          setIsTranscribing(false);
          console.error('Transcription error:', err);
          toast({ variant: 'destructive', title: 'Transcription failed', description: 'Could not transcribe audio. Please use text input.' });
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access error:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please allow microphone access in your browser settings to use voice input.',
      });
    }
  };

  const isBusy = isLoading || isGeneratingAudio || isTranscribing;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold font-headline">{t('voice.title')}</CardTitle>
            <CardDescription className="text-lg text-muted-foreground">
              {t('voice.subtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-4 h-96 overflow-y-auto p-4 rounded-lg border bg-muted/50">
              {messages.length === 0 && !isBusy && (
                <div className="flex flex-col h-full items-center justify-center text-center text-muted-foreground">
                  <Volume2 className="w-16 h-16 mb-4"/>
                  <p className="font-semibold">Your conversation will appear here.</p>
                  <p>Start by typing a message or using voice input.</p>
                </div>
              )}

              {messages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'model' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Bot size={20}/>
                    </div>
                  )}
                  <div className={`rounded-lg px-4 py-2 max-w-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                      <User size={20}/>
                    </div>
                  )}
                </div>
              ))}

              {isTranscribing && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                    <Mic size={16}/>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-background flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin"/>
                    <span className="text-sm text-muted-foreground">Transcribing...</span>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Bot size={20}/>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-background flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin"/>
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}

              {isGeneratingAudio && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Volume2 size={16}/>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-background flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin"/>
                    <span className="text-sm text-muted-foreground">Generating voice...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <div className="flex justify-center">
              <Button
                onClick={toggleRecording}
                size="lg"
                className="rounded-full w-16 h-16"
                disabled={isBusy && !isRecording}
                variant={isRecording ? "destructive" : "default"}
              >
                {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
              </Button>
            </div>

            <form onSubmit={handleTextSubmit} className="w-full flex gap-2">
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message here..."
                className="flex-1"
                disabled={isBusy}
              />
              <Button
                type="submit"
                size="lg"
                disabled={!inputText.trim() || isBusy}
              >
                <Send size={20} />
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              {isRecording ? "Recording... tap to stop" :
               isTranscribing ? "Transcribing your voice..." :
               isLoading ? "Thinking..." :
               isGeneratingAudio ? "Generating voice..." :
               "Type a message or tap the mic to speak"}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

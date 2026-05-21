import { useState, useEffect, useRef } from "react";

const PHRASE_CHANGE_INTERVAL_MS = 15_000;

const DEFAULT_PHRASES: string[] = [
  "Processando...",
  "Analisando o código...",
  "Pensando nisso...",
  "Verificando dependências...",
  "Elaborando solução...",
  "Checando o contexto...",
  "Refinando a resposta...",
  "Quase lá...",
  "Conectando os pontos...",
  "Revisando...",
];

export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  customPhrases?: string[],
): string => {
  const phrases = customPhrases && customPhrases.length > 0 ? customPhrases : DEFAULT_PHRASES;
  const [phrase, setPhrase] = useState(phrases[0] ?? "");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setPhrase("Aguardando confirmação...");
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)] ?? "");
      intervalRef.current = setInterval(() => {
        setPhrase(phrases[Math.floor(Math.random() * phrases.length)] ?? "");
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setPhrase(phrases[0] ?? "");
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isWaiting]);

  return phrase;
};

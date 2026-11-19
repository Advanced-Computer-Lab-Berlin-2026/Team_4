import { createContext, useContext } from 'react';

export const FeedbackContext = createContext(null);

export default function useFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error('FeedbackProvider is missing');
  return feedback;
}

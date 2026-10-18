import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { buildMessages } from './prompts.js';
import { HttpError } from '../../lib/errors.js';

const ChatState = Annotation.Root({
  message: Annotation(),
  history: Annotation(),
  useRetrieval: Annotation(),
  documents: Annotation(),
  reply: Annotation(),
});

// No shared conversation state: each API request supplies its own bounded history.
// Add authenticated persistence/checkpointing here when your application needs it.
export function createChatbotGraph({ getLLM, getVectorStore }) {
  return new StateGraph(ChatState)
    .addNode('retrieve', async (state) => {
      if (!state.useRetrieval) return { documents: [] };
      // Include recent user turns so follow-up questions retain some retrieval context.
      const query = [...state.history.filter((item) => item.role === 'user').slice(-2).map((item) => item.content), state.message].join('\n');
      return { documents: await getVectorStore().search(query) };
    })
    .addNode('generate', async (state) => {
      if (state.useRetrieval && state.documents.length === 0) {
        return { reply: 'I could not find relevant information in the knowledge base. Add a relevant document or try a more specific question.' };
      }
      const result = await getLLM().invoke(buildMessages(state));
      const reply = typeof result.content === 'string'
        ? result.content
        : result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
      if (!reply.trim()) throw new HttpError(502, 'The model returned an empty response. Please try again.');
      return { reply };
    })
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', END)
    .compile();
}

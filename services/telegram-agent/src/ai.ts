import axios from 'axios';

const API_URL = process.env.AGENT_API_URL || 'http://127.0.0.1:3100';

export interface ChatResult {
  reply: string;
  properties?: Array<{
    cover_image: string; address: string; current_price: number;
    beds?: string; baths?: string; sqft?: string; status?: string;
  }>;
}

export async function chat(chatId: number, userMessage: string, userId?: number): Promise<ChatResult> {
  try {
    const r = await axios.post(`${API_URL}/api/agent/chat`, {
      message: userMessage,
      chatId,
      userId: String(userId || chatId),
      channel: 'telegram',
    }, { timeout: 35000 });
    return {
      reply: r.data.reply || '❌ No response.',
      properties: r.data.properties || [],
    };
  } catch (err: any) {
    console.error('Agent chat error:', err.message);
    return { reply: '❌ Error connecting to AI. Try again.' };
  }
}

export function clearHistory(_chatId: number) {
  // History is managed server-side in agent-api
}

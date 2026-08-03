import fetch, { type RequestInit, type Response } from 'node-fetch';

export type NotificationFetch = (url: string, init?: RequestInit) => Promise<Response>;

export const validTelegramToken = (value: string) => /^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(value);
export const validTelegramChat = (value: string) => /^-?\d{1,24}$/.test(value);

export class TelegramTransport {
  constructor(private readonly fetchImpl: NotificationFetch = fetch as NotificationFetch) {}

  private async call(token:string,method:string,payload:Record<string,unknown>={}):Promise<any>{
    if (!validTelegramToken(token)) throw new Error('invalid_bot_token');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal as any,
        body: JSON.stringify(payload)
      });
      const raw = (await response.text()).slice(0, 8192);
      let body: any = {};
      try { body = JSON.parse(raw); } catch {}
      if (!response.ok || body?.ok !== true) throw new Error(method==='getUpdates'?'telegram_updates_unavailable':'telegram_rejected');
      return body.result;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('telegram_timeout');
      if (['invalid_bot_token', 'invalid_chat_id', 'telegram_rejected','telegram_updates_unavailable'].includes(String(error?.message))) throw error;
      throw new Error('telegram_network_error');
    } finally { clearTimeout(timeout); }
  }
  async send(token: string, chatId: string, text: string): Promise<void> {if(!validTelegramChat(chatId))throw new Error('invalid_chat_id');await this.call(token,'sendMessage',{chat_id:chatId,text:text.slice(0,4000),disable_web_page_preview:true})}
  async identity(token:string):Promise<{id:string;username:string;displayName:string}>{const bot=await this.call(token,'getMe');return{id:String(bot?.id||''),username:String(bot?.username||''),displayName:[bot?.first_name,bot?.last_name].filter(Boolean).join(' ')}}
  async discoverChats(token:string):Promise<Array<{chatId:string;type:string;title:string}>>{const updates=await this.call(token,'getUpdates',{timeout:0,limit:100,allowed_updates:['message','channel_post','my_chat_member']});const chats=new Map<string,{chatId:string;type:string;title:string}>();for(const update of Array.isArray(updates)?updates:[]){const chat=update?.message?.chat||update?.channel_post?.chat||update?.my_chat_member?.chat;if(!chat?.id)continue;const id=String(chat.id);chats.set(id,{chatId:id,type:String(chat.type||'unknown'),title:String(chat.title||chat.username||chat.first_name||id).slice(0,191)})}return[...chats.values()]}
}

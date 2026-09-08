import { OpenAIRealtimeAdapter } from "./openaiRealtimeAdapter.js";

export class YandexRealtimeAdapter extends OpenAIRealtimeAdapter {
  constructor() {
    super("yandex_speechkit");
  }
}

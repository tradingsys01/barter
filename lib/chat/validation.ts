import { z } from "zod";

export const sendMessageSchema = z.object({
  chat_id: z.string().uuid(),
  body: z.string().trim().min(1, "Type something").max(4000, "Message is too long"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

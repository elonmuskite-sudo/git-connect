import { databases, isAppwriteDataAvailable, APPWRITE_DATABASE_ID, ID, Query } from './appwrite'

export async function fetchAppwriteChats() {
  if (!databases || !isAppwriteDataAvailable()) return []

  const { documents } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'chats', [
    Query.orderDesc('created_at'),
  ])
  return documents || []
}

export async function sendAppwriteMessage(chatId, message) {
  if (!databases || !isAppwriteDataAvailable()) return null

  return databases.createDocument(APPWRITE_DATABASE_ID, 'messages', message.id || ID.unique(), {
    chat_id: String(chatId),
    sender_id: message.sender_id ? String(message.sender_id) : null,
    content: message.content,
    type: message.type || 'text',
    file_url: message.file_url || null,
    file_name: message.file_name || null,
    encrypted: Boolean(message.encrypted),
    created_at: message.created_at || new Date().toISOString(),
  })
}

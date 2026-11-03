import { supabase } from './supabase'

export type NotifyEvent =
  | 'invoice_sent' | 'invoice_reminder' | 'lesson_booked' | 'lesson_changed' | 'lesson_cancelled'
  | 'homework_set' | 'homework_marked' | 'enquiry_received'

/** Ask the server to email the right people about something that just happened. Never blocks the screen. */
export function notify(event: NotifyEvent, id: string) {
  supabase.functions.invoke('notify', { body: { event, id } }).catch(() => { /* logged server-side */ })
}

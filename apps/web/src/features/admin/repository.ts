import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckImpact } from '@qv/schema';

/**
 * Administrators and reports of errors in the cards, in the USERS database. The database decides who is an
 * administrator and what each one can read (RLS and `is_admin()`); the web only uses the answer to show the panel.
 */

/** What a student sends from a card. */
export interface NewCardReport {
  noteGuid: string;
  ord: number;
  deckId: string | null;
  code: string | null;
  version: number | null;
  comment: string;
}

export type ReportStatus = 'open' | 'resolved';

/** A report as the panel shows it, with who wrote it. */
export interface CardReport extends NewCardReport {
  id: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporterEmail: string | null;
  reporterName: string | null;
}

export interface AdminRepository {
  isAdmin(): Promise<boolean>;
  reportCard(report: NewCardReport): Promise<void>;
  /** Every report, the newest first. Only for an administrator. */
  listReports(): Promise<CardReport[]>;
  setReportStatus(id: string, status: ReportStatus): Promise<void>;
  /**
   * Whom a release reaches (step 1.7): by deck, how many students saw some of its cards, how many cards in all and how
   * many turned it on. Only for an administrator; at most 300 decks (`admin_deck_impact()`).
   */
  deckImpact(deckIds: readonly string[]): Promise<DeckImpact[]>;
}

interface ReportRow {
  id: string;
  note_guid: string;
  ord: number;
  deck_id: string | null;
  card_code: string | null;
  card_version: number | null;
  comment: string;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
}

export function supabaseAdminRepository(client: SupabaseClient): AdminRepository {
  return {
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },
    async reportCard(r) {
      const { error } = await client.from('card_reports').insert({
        note_guid: r.noteGuid,
        ord: r.ord,
        deck_id: r.deckId,
        card_code: r.code,
        card_version: r.version,
        comment: r.comment,
      });
      if (error) throw error;
    },
    async listReports() {
      const { data, error } = await client.rpc('admin_card_reports');
      if (error) throw error;
      return (data as ReportRow[]).map((r) => ({
        id: r.id,
        noteGuid: r.note_guid,
        ord: r.ord,
        deckId: r.deck_id,
        code: r.card_code,
        version: r.card_version,
        comment: r.comment,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        reporterEmail: r.reporter_email,
        reporterName: r.reporter_name,
      }));
    },
    async setReportStatus(id, status) {
      const { error } = await client
        .from('card_reports')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    async deckImpact(deckIds) {
      const { data, error } = await client.rpc('admin_deck_impact', { deck_ids: deckIds });
      if (error) throw error;
      return (
        data as {
          deck_id: string;
          students_seen: number;
          cards_seen: number;
          students_active: number;
        }[]
      ).map((r) => ({
        deckId: r.deck_id,
        studentsSeen: r.students_seen,
        cardsSeen: r.cards_seen,
        studentsActive: r.students_active,
      }));
    },
  };
}

/** The demo and the tests, without a database: the reports stay in this browser (or in memory). */
export function localAdminRepository(
  options: { admin?: boolean; storage?: Storage | null } = {},
): AdminRepository {
  const storage = options.storage ?? null;
  const KEY = 'qv-demo-reports';
  let memory: CardReport[] = [];
  const read = (): CardReport[] => {
    if (!storage) return memory;
    try {
      return JSON.parse(storage.getItem(KEY) ?? '[]') as CardReport[];
    } catch {
      return [];
    }
  };
  const write = (list: CardReport[]) => {
    memory = list;
    try {
      storage?.setItem(KEY, JSON.stringify(list));
    } catch {
      // blocked storage: they stay in memory
    }
  };
  return {
    isAdmin: async () => options.admin ?? false,
    async reportCard(r) {
      write([
        {
          ...r,
          id: crypto.randomUUID(),
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          reporterEmail: 'demo@ug.uchile.cl',
          reporterName: 'Estudiante de prueba',
        },
        ...read(),
      ]);
    },
    listReports: async () => read(),
    async setReportStatus(id, status) {
      write(
        read().map((r) =>
          r.id === id
            ? { ...r, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null }
            : r,
        ),
      );
    },
    // Nobody else studies in the demo.
    deckImpact: async (deckIds) =>
      deckIds.map((deckId) => ({ deckId, studentsSeen: 0, cardsSeen: 0, studentsActive: 0 })),
  };
}

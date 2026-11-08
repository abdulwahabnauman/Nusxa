/**
 * Nusxa Chat Function Tools & MCP Interface.
 * Enables the AI companion to reliably query real on-device SQLite databases
 * for active prescriptions, today's schedule, pill inventory levels, and adherence.
 * Prevents hallucinations by grounding responses in verified clinical records.
 */

import { getActiveMedicines } from '../db/repositories/medicine';
import { getTodayDoseRecords, getDailyAdherence } from '../db/repositories/dose';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** Standard OpenAI / MCP tool schemas for Nusxa Chat */
export const NUSXA_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_active_prescriptions',
      description: 'Get all active, verified medicines prescribed to the patient, including dosage, frequency, and instructions.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_schedule',
      description: 'Get all scheduled doses for today, including scheduled times, medicine names, and whether they are taken, pending, or missed.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: {
            type: 'string',
            enum: ['all', 'pending', 'taken', 'missed'],
            description: 'Optional filter by dose status',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_levels',
      description: 'Check remaining pill count / inventory stock for all active medications, identifying medicines that need refill soon.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_adherence_summary',
      description: 'Get the patient adherence rate and dose completion statistics for the last 7 days.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

/**
 * Executes a tool against the local SQLite database and returns a formatted JSON string.
 */
export async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  switch (name) {
    case 'get_active_prescriptions': {
      const medicines = await getActiveMedicines();
      if (medicines.length === 0) {
        return JSON.stringify({ count: 0, medicines: [], message: 'No active verified medicines found.' });
      }
      return JSON.stringify({
        count: medicines.length,
        medicines: medicines.map((m) => ({
          name: m.name,
          generic_name: m.generic_name,
          strength: m.strength,
          dosage: m.dosage,
          frequency: m.frequency,
          meal_instruction: m.meal_instruction,
          purpose: m.purpose,
          warnings: m.warnings,
          remaining_quantity: m.remaining_quantity,
        })),
      });
    }

    case 'get_today_schedule': {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [doses, medicines] = await Promise.all([
        getTodayDoseRecords(todayStr),
        getActiveMedicines(),
      ]);

      const medMap = new Map<string, string>();
      for (const m of medicines) {
        medMap.set(m.id, m.name || m.generic_name || 'Prescribed Medicine');
      }

      let filtered = doses;
      const statusFilter = args.status_filter as string | undefined;
      if (statusFilter && statusFilter !== 'all') {
        filtered = doses.filter((d) => d.status === statusFilter);
      }

      return JSON.stringify({
        date: todayStr,
        total_doses: doses.length,
        filtered_count: filtered.length,
        schedule: filtered.map((d) => ({
          medicine_name: medMap.get(d.medicine_id) || 'Medicine',
          scheduled_time: d.scheduled_time,
          status: d.status,
          actual_time: d.actual_time,
        })),
      });
    }

    case 'get_inventory_levels': {
      const medicines = await getActiveMedicines();
      const inventory = medicines.map((m) => {
        const remaining = m.remaining_quantity ?? null;
        const initial = m.initial_quantity ?? null;
        const isLow = remaining !== null && (remaining <= 5 || (initial !== null && remaining / initial <= 0.2));
        return {
          medicine_name: m.name || m.generic_name || 'Prescribed Medicine',
          remaining_quantity: remaining,
          initial_quantity: initial,
          is_low_stock: isLow,
        };
      });

      return JSON.stringify({
        active_medicines_count: medicines.length,
        low_stock_count: inventory.filter((i) => i.is_low_stock).length,
        inventory,
      });
    }

    case 'get_adherence_summary': {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const records = await getDailyAdherence(sevenDaysAgo);
      const total = records.reduce((sum, r) => sum + r.total, 0);
      const taken = records.reduce((sum, r) => sum + r.taken, 0);
      const ratePct = total > 0 ? Math.round((taken / total) * 100) : 100;

      return JSON.stringify({
        period: 'Last 7 days',
        total_scheduled_doses: total,
        total_taken_doses: taken,
        adherence_rate_percent: ratePct,
        daily_breakdown: records,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/**
 * Heuristic detector for direct user queries that can be answered or augmented
 * with local SQLite tools.
 */
export function matchToolForQuery(query: string): { name: string; args: Record<string, unknown> } | null {
  const q = query.toLowerCase().trim();

  // Schedule & today's doses
  if (
    q.includes('today schedule') ||
    q.includes('doses today') ||
    q.includes('dose today') ||
    q.includes('what medicine do i take today') ||
    q.includes('kya lena hai aaj') ||
    q.includes('aaj ki dawai') ||
    q.includes('did i take') ||
    q.includes('kya maine dawai li')
  ) {
    return { name: 'get_today_schedule', args: {} };
  }

  // Inventory / Stock
  if (
    q.includes('how many pills') ||
    q.includes('pills left') ||
    q.includes('tablets left') ||
    q.includes('medicine left') ||
    q.includes('kitni dawai bachi') ||
    q.includes('stock') ||
    q.includes('refill')
  ) {
    return { name: 'get_inventory_levels', args: {} };
  }

  // Adherence
  if (
    q.includes('adherence') ||
    q.includes('compliance') ||
    q.includes('how well am i taking') ||
    q.includes('missed doses') ||
    q.includes('track record')
  ) {
    return { name: 'get_adherence_summary', args: {} };
  }

  // Active prescriptions
  if (
    q.includes('what medicines am i taking') ||
    q.includes('my medicines') ||
    q.includes('active medicines') ||
    q.includes('meri dawaiyan') ||
    q.includes('list my prescriptions')
  ) {
    return { name: 'get_active_prescriptions', args: {} };
  }

  return null;
}

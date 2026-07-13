import type { IncidentRecord, PlaybookStep } from '../../types/audit';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour12: false });
}

export interface Remediation {
  description: string;
  action: () => void;
}

// The standard 4-step recovery plan for any detected incident: by the time
// an incident exists, detection/classification/correlation already
// happened, so only the last step — the actual fix — starts pending.
export function buildPlaybookSteps(incident: IncidentRecord, remediation: Remediation): PlaybookStep[] {
  return [
    {
      id: `${incident.id}-detect`,
      title: 'Аномалію виявлено',
      description: `${incident.detectorName} зафіксував "${incident.incidentType}" о ${formatTime(incident.detectedAt)}`,
      status: 'done',
    },
    {
      id: `${incident.id}-classify`,
      title: 'Класифіковано',
      description: `Клас помилки: ${incident.errorClass} · Серйозність: ${incident.severity}`,
      status: 'done',
    },
    {
      id: `${incident.id}-correlate`,
      title: 'Кореляційний ланцюжок зібрано',
      description: `order_id: ${incident.orderId ?? '—'} · correlation_id: ${incident.correlationIds[0] ?? '—'}`,
      status: 'done',
    },
    {
      id: `${incident.id}-fix`,
      title: 'Застосувати виправлення',
      description: remediation.description,
      status: 'pending',
      action: remediation.action,
    },
  ];
}

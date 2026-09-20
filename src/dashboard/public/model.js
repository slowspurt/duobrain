export const terminalTicketStatuses = new Set(['resolved', 'closed']);

export const ticketStatusLabels = {
  open: '미확인',
  acknowledged: '읽음',
  needs_information: '추가 정보 필요',
  answered: '응답 도착',
  resolved: '요청자가 해결 확인',
  closed: '해결 없이 종료',
};

export function ticketEvidence(ticket) {
  const paths = Array.isArray(ticket?.evidence) ? ticket.evidence : [];
  const historyPaths = (Array.isArray(ticket?.history) ? ticket.history : [])
    .flatMap((event) => Array.isArray(event?.data?.evidence) ? event.data.evidence : []);
  return [...new Set([...paths, ...historyPaths].filter((path) => typeof path === 'string' && path.trim()))];
}

export function peerConfirmation(status) {
  if (status === 'open') return '상대 확인 안 됨';
  if (status === 'acknowledged') return '상대 확인됨 · 답변 전';
  if (status === 'needs_information') return '상대 확인됨 · 추가 정보 요청';
  if (status === 'answered') return '응답 도착 · 해결 확인 전';
  if (status === 'resolved') return '응답과 해결 확인 완료';
  if (status === 'closed') return '해결되지 않고 종료';
  return '상대 확인 상태 미확인';
}

export function filterTickets(tickets, { tab = 'inbox', query = '', status = '', kind = '', peer = '' } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return (Array.isArray(tickets) ? tickets : []).filter((ticket) => {
    const terminal = terminalTicketStatuses.has(ticket?.status);
    if ((tab === 'history') !== terminal) return false;
    if (status && ticket?.status !== status) return false;
    if (kind && ticket?.kind !== kind) return false;
    if (peer && ticket?.requester !== peer && ticket?.assignee !== peer) return false;
    if (!needle) return true;
    const searchable = [ticket?.title, ticket?.body, ticket?.goal, ticket?.requester, ticket?.assignee, ...ticketEvidence(ticket)]
      .filter((value) => typeof value === 'string').join('\n').toLocaleLowerCase();
    return searchable.includes(needle);
  });
}

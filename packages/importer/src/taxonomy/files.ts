// The name of an assessment's file in content/taxonomy and content/topic-map.

export function assessmentFileName(assessmentId: string): string {
  return `${assessmentId.replace(/\//g, '-')}.json`;
}

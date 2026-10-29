/** Keep the startup screen until every required visual is ready, in any load order. */
export class StartupAssets {
  private jobs = new Map<string, { load: () => Promise<void>; state: 'pending' | 'ready' | 'failed' }>();
  private sealed = false;
  constructor(private changed: () => void) {}
  get ready() { return this.sealed && Array.from(this.jobs.values()).every(job => job.state === 'ready'); }
  get failed() { return Array.from(this.jobs.values()).some(job => job.state === 'failed'); }
  add(key: string, load: () => Promise<void>) {
    const job = { load, state: 'pending' as const };
    this.jobs.set(key, job); this.run(key);
  }
  seal() { this.sealed = true; this.changed(); }
  retry() {
    const keys = Array.from(this.jobs.entries()).filter(([, job]) => job.state === 'failed').map(([key]) => key);
    for (const key of keys) this.run(key);
    this.changed();
  }
  private run(key: string) {
    const job = this.jobs.get(key)!; job.state = 'pending';
    Promise.resolve().then(job.load).then(() => { job.state = 'ready'; }, () => { job.state = 'failed'; }).then(() => this.changed());
  }
}

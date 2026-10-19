/** Binary min-heap of (key, value) pairs over typed arrays; keys are minutes, values are cell indices. */
export class MinHeap {
  private keys: Float64Array;
  private values: Int32Array;
  size = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.values = new Int32Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  push(key: number, value: number): void {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    const keys = this.keys, values = this.values;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  /** Key of the smallest element; only valid when size > 0. */
  peekKey(): number {
    return this.keys[0];
  }

  /** Removes the smallest element and returns its value; only valid when size > 0. */
  pop(): number {
    const keys = this.keys, values = this.values;
    const top = values[0];
    const n = --this.size;
    if (n === 0) return top;
    const key = keys[n], value = values[n];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= n) break;
      if (child + 1 < n && keys[child + 1] < keys[child]) child++;
      if (keys[child] >= key) break;
      keys[i] = keys[child];
      values[i] = values[child];
      i = child;
    }
    keys[i] = key;
    values[i] = value;
    return top;
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2);
    const values = new Int32Array(this.values.length * 2);
    keys.set(this.keys);
    values.set(this.values);
    this.keys = keys;
    this.values = values;
  }
}

const queue = [];
let processing = false;

export async function addTask(task) {
  queue.push(task);
  processQueue();
}

async function processQueue() {
  if (processing) return;

  processing = true;

  while (queue.length > 0) {
    const task = queue.shift();

    try {
      await task();
    } catch (err) {
      console.error("Queue task failed:", err.message);
    }
  }

  processing = false;
}

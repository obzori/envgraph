import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";

// run an exported function in a worker thread so the main-thread spinner
// keeps animating while the (synchronous) analysis runs
export function runInWorker<T>(
	modulePath: string,
	fnName: string,
	args: readonly unknown[],
): Promise<T> {
	const script = `
import { parentPort, workerData } from "node:worker_threads";
const mod = await import(workerData.module);
const result = await mod[workerData.fn](...workerData.args);
parentPort.postMessage(result === undefined ? null : result);
`;
	return new Promise<T>((resolve, reject) => {
		const worker = new Worker(script, {
			eval: true,
			workerData: {
				module: pathToFileURL(modulePath).href,
				fn: fnName,
				args,
			},
		});
		worker.once("message", resolve);
		worker.once("error", reject);
		worker.once("exit", (code) => {
			if (code !== 0) {
				reject(new Error(`worker exited with code ${code}`));
			}
		});
	});
}

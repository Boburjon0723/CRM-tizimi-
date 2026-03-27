/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, message = "So'rov vaqti tugadi.") {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms)
        promise.then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (err) => {
                clearTimeout(timer)
                reject(err)
            }
        )
    })
}

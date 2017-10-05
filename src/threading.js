const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (test, timeout, interval = 1000) => {
    let timeoutTime = new Date(new Date().getTime() + timeout);
    try {
        do {
            if (timeoutTime < new Date()) {
                return false;
            }
            await sleep(interval);
        } while(!(await test()));
    } catch (err) { return false; }
    return true;
}
const waitForExp = async (test, timeout) => {
    const getWaitTime = count => Math.pow(2, count) * 1000;
    let retries = 0;
    let timeoutTime = new Date(new Date().getTime() + timeout);
    try {
        do {
            if (timeoutTime < new Date()) {
                return false;
            }
            await sleep(getWaitTime(++retries));
        } while(!(await test())) 
    } catch (err) { return false; }
    return true;
}

module.exports = {
    sleep: sleep,
    waitFor: waitFor,
    waitForExp: waitForExp
} 
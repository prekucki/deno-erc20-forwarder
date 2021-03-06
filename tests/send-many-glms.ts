import { TransactionSender } from '../sci/transaction-sender.ts';
import { dotenv, log } from '../deps.ts';
import { setupWeb3Api } from '../sci.ts';
import { contract } from '../sci/golem-polygon-contract.ts';

await log.setup({
    handlers: {
        default: new log.handlers.ConsoleHandler('DEBUG'),
    },
    loggers: {
        default: { level: 'DEBUG', handlers: ['default'] },
        sci: { level: 'DEBUG', handlers: ['default'] },
    },
});

await dotenv.config({ export: true });

const secretKey = Deno.env.get('SECRET');

if (!secretKey) {
    throw new Error('missing secret key');
}

const web3 = setupWeb3Api('http://bor2.golem.network');
const glm = contract(web3);
const sender = new TransactionSender(web3, secretKey);

const data = glm.methods.transfer('0x226aC45F7145C73331B721F3229AFdBEC470D724', web3.utils.toWei('0.001')).encodeABI();

sender.start();
console.log(`started sender on ${sender.address}`);
try {
    for (const _ of [1, 2, 3]) {
        const txId = await sender.sendTx({
            to: '0x0B220b82F3eA3B7F6d9A1D8ab58930C064A2b5Bf',
            data,
        });
        console.log(`tx=${txId}`);
    }
} catch (e) {
    console.error(e);
}

try {
    const result = await Promise.all([1, 2, 3].map((_) =>
        sender.sendTx({
            to: '0x0B220b82F3eA3B7F6d9A1D8ab58930C064A2b5Bf',
            data,
        })
    ));

    console.log('r=', result);
} catch (e) {
    console.error(e);
}

await sender.stop();

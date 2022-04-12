import { log } from '../deps.ts';
import { Context, Router, Status } from '../webapps.ts';
import { z } from '../deps.ts';
import { utils } from '../sci.ts';
import web3, { config, glm, gracePeriodMs } from '../config.ts';
import { TransactionSender } from '../sci/transaction-sender.ts';
import { decodeTransfer } from '../sci/transfer-tx-decoder.ts';
import { validateCallArguments } from '../sci/validate-call-arguments.ts';

const HexString = () => z.string().refine(utils.isHex, 'expected hex string');
const Address = () => z.string().refine(utils.isAddress, 'expected eth address');

const ForwardRequest = z.object({
    r: HexString(),
    s: HexString(),
    v: HexString(),
    sender: Address(),
    abiFunctionCall: HexString(),
    signedRequest: HexString().optional(),
});

const sender = new TransactionSender(web3, config.secret!);

sender.start();

const pendingSenders = new Set<string>();

export default new Router()
    .post('/transfer', async (ctx: Context) => {
        const logger = log.getLogger('webapps');
        try {
            const input = ForwardRequest.parse(await ctx.request.body({ type: 'json' }).value);
            // checking if this is transfer
            const decoded_arguments = decodeTransfer(input.abiFunctionCall);
            if (!decoded_arguments) {
                ctx.response.status = 400;
                ctx.response.body = {
                    message: 'unable to decode transaction',
                };
                return;
            }

            // TODO: provide block number
            const block_number = 1234;

            const error_details = await validateCallArguments(input.sender, decoded_arguments, block_number);

            if (!error_details) {
                ctx.response.status = 400;
                ctx.response.body = {
                    message: error_details,
                };
                return;
            }

            logger.info(() => `Forwarding transfer from ${input.sender} to ${decoded_arguments.recipient} of ${utils.fromWei(decoded_arguments.amount)}`);
            logger.debug(() => `input=${JSON.stringify(input)}`);

            const data = glm.methods.executeMetaTransaction(input.sender, input.abiFunctionCall, input.r, input.s, input.v).encodeABI();

            if (pendingSenders.has(input.sender)) {
                ctx.response.status = 429;
                ctx.response.body = {
                    'message': 'processing concurrent transaction',
                };
                return;
            }
            try {
                pendingSenders.add(input.sender);
                const now = new Date().getTime();
                const storageKey = `sender.${input.sender}`;
                if (gracePeriodMs) {
                    const prev = localStorage.getItem(storageKey);
                    logger.debug(() => `check gracePeriodMs=${gracePeriodMs}, for ${storageKey}, prev=${prev}`);
                    if (prev && (now - parseInt(prev)) < gracePeriodMs) {
                        const retryAfter = new Date(parseInt(prev) + gracePeriodMs);
                        ctx.response.status = 429;
                        ctx.response.headers.set('Retry-After', retryAfter.toUTCString());
                        ctx.response.body = {
                            'message': 'Grace period did not pass for this address',
                        };
                        return;
                    }
                }

                const txId = await sender.sendTx({ to: glm.options.address, data });

                localStorage.setItem(storageKey, now.toString());
                ctx.response.type = 'json';
                ctx.response.body = { txId };
            } finally {
                pendingSenders.delete(input.sender);
            }
        } catch (e) {
            if (e instanceof z.ZodError) {
                ctx.response.status = 400;
                ctx.response.body = {
                    message: 'invalid request body',
                    issues: e.issues,
                };
                return;
            }
            if (e instanceof SyntaxError) {
                ctx.response.status = 400;
                ctx.response.body = {
                    message: e.message,
                };
                return;
            }
            throw e;
        }
    })
    .get('/status', async (ctx: Context) => {
        const networkId = await web3.eth.net.getId();
        const address = sender.address;
        const gas = utils.fromWei(await web3.eth.getBalance(address));
        const queueSize = sender.queueSize;
        const contractAddress = config.contractAddress;
        ctx.response.status = Status.OK;
        ctx.response.type = 'json';
        ctx.response.body = {
            networkId,
            address,
            gas,
            queueSize,
            contractAddress,
            gracePeriodMs,
        };
    });

import { TransferArgs } from './transfer-tx-decoder.ts';
import web3, { blockMaxAgeS, glm } from '../config.ts';

export async function validateCallArguments(sender: string, transfer_details: TransferArgs, blockNumber: string): Promise<string | undefined> {
    const requested_amount = web3.utils.toBN(transfer_details.amount);

    if (requested_amount.isZero()) {
        return 'Cannot transfer 0 tokens';
    }

    let from = sender;
    if (!from.startsWith('0x')) {
        from = '0x' + from;
    }

    let to = transfer_details.recipient;
    if (!to.startsWith('0x')) {
        to = '0x' + to;
    }

    if (from === to) {
        return 'Sender and recipient addresses must differ';
    }

    let block;
    try {
        block = await web3.eth.getBlock(blockNumber);
    } catch (_error) {
        return `Block ${blockNumber} is too old`;
    }

    if (!block.nonce) {
        return `Block ${blockNumber} is still pending`;
    }

    const now_seconds = Date.now() / 1000;
    if (now_seconds - +block.timestamp > blockMaxAgeS) {
        return 'Provided block is too old and can contain stale data';
    }

    const balance = await web3.eth.call({ data: glm.methods.balanceOf(from).encodeABI(), to: glm.options.address }, blockNumber).then((res) => web3.utils.toBN(res));

    if (!requested_amount.eq(balance)) {
        return 'Only full withdrawals are supported';
    }

    return undefined;
}

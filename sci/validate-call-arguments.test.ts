import { assertEquals } from 'https://deno.land/std@0.134.0/testing/asserts.ts';
import web3, { config, glm } from '../config.ts';
import { TransferArgs } from './transfer-tx-decoder.ts';
import { validateCallArguments } from './validate-call-arguments.ts';

const IS_OFFLINE = (await Deno.permissions.query({ name: 'net' })).state !== 'granted';

Deno.test({
    name: 'zero tokens',
    ignore: IS_OFFLINE,
    async fn() {
        let block_number = 1234;
        let args: TransferArgs = { recipient: '0x4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD', amount: '0' };
        let sender = '0x26C80CC193B27d73D2C40943Acec77F4DA2c5bd8';

        let error_details = await validateCallArguments(sender, args, block_number);
        assertEquals(error_details, 'Cannot transfer 0 tokens');
    },
});

Deno.test({
    name: 'sender and recipient are the same',
    ignore: IS_OFFLINE,
    async fn() {
        let block_number = 1234;
        let address = '0x4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD';
        let args: TransferArgs = { recipient: address, amount: '1' };
        let sender = address;

        let error_details = await validateCallArguments(sender, args, block_number);
        assertEquals(error_details, 'Sender and recipient addresses must differ');

        error_details = await validateCallArguments('4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD', args, block_number);
        assertEquals(error_details, 'Sender and recipient addresses must differ');
    },
});

Deno.test({
    name: 'block too old',
    ignore: IS_OFFLINE,
    async fn() {
        let block_number = 1234;
        let args: TransferArgs = { recipient: '0x4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD', amount: '1' };
        let sender = '0xFeaED3f817169C012D040F05C6c52bCE5740Fc37';

        let error_details = await validateCallArguments(sender, args, block_number);
        assertEquals(error_details, `Provided block is too old and can contain stale data`);
    },
});

Deno.test({
    name: 'not full withdrawal',
    ignore: IS_OFFLINE,
    async fn() {
        let args: TransferArgs = {
            recipient: '0x4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD',
            amount: web3.utils.toWei('0.001'),
        };
        let sender = '0xFeaED3f817169C012D040F05C6c52bCE5740Fc37';
        let block_number = await web3.eth.getBlock('latest').then((block) => block.number);

        let error_details = await validateCallArguments(sender, args, block_number);
        assertEquals(error_details, `Only full withdrawals are supported`);
    },
});

Deno.test({
    name: 'valid call',
    ignore: IS_OFFLINE,
    async fn() {
        let sender = '0xFeaED3f817169C012D040F05C6c52bCE5740Fc37';
        let block_number = await web3.eth.getBlock('latest').then((block) => block.number);
        let balance = await web3.eth.call({
            data: glm.methods.balanceOf(sender).encodeABI(),
            to: glm.options.address,
        }, block_number).then((res) => web3.utils.toBN(res));
        let args: TransferArgs = { recipient: '0x4DCeBf483fA7f31FfCee6e4EAffC1D78308Ec2cD', amount: balance.toString() };

        let error_details = await validateCallArguments(sender, args, block_number);
        assertEquals(error_details, undefined);
    },
});

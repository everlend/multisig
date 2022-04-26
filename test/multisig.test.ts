import { AnchorProvider, web3, setProvider, BN } from '@project-serum/anchor'
import { program } from './utils'

describe('multisig', () => {
  const provider = AnchorProvider.env()

  beforeAll(async () => {
    setProvider(provider)
  })

  test('tests the multisig program', async () => {
    const multisig = web3.Keypair.generate()
    const [multisigSigner, nonce] = await web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      program.programId,
    )
    const multisigSize = 200 // Big enough.

    const ownerA = web3.Keypair.generate()
    const ownerB = web3.Keypair.generate()
    const ownerC = web3.Keypair.generate()
    const ownerD = web3.Keypair.generate()
    const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey]

    const threshold = new BN(2)

    await program.methods
      .createMultisig(owners, threshold, nonce)
      .accounts({
        multisig: multisig.publicKey,
      })
      .preInstructions([await program.account.multisig.createInstruction(multisig, multisigSize)])
      .signers([multisig])
      .rpc()

    let multisigAccount = await program.account.multisig.fetch(multisig.publicKey)
    expect(multisigAccount.nonce).toStrictEqual(nonce)
    expect(multisigAccount.threshold.eq(new BN(2))).toBe(true)
    expect(multisigAccount.owners).toEqual(expect.arrayContaining(owners))
    expect(multisigAccount.ownerSetSeqno).toBe(0)

    const pid = program.programId
    const accounts = [
      {
        pubkey: multisig.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: multisigSigner,
        isWritable: false,
        isSigner: true,
      },
    ]
    const newOwners = [ownerA.publicKey, ownerB.publicKey, ownerD.publicKey]
    const data = program.coder.instruction.encode('set_owners', {
      owners: newOwners,
    })

    const transaction = web3.Keypair.generate()
    const txSize = 1000 // Big enough, cuz I'm lazy.
    await program.methods
      .createTransaction(pid, accounts, data)
      .accounts({
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        proposer: ownerA.publicKey,
      })
      .preInstructions([await program.account.transaction.createInstruction(transaction, txSize)])
      .signers([transaction, ownerA])
      .rpc()

    const txAccount = await program.account.transaction.fetch(transaction.publicKey)
    console.log(txAccount)

    // Other owner approves transactoin.
    await program.methods
      .approve()
      .accounts({
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      })
      .signers([ownerB])
      .rpc()

    const setOwnerAccounts = program.instruction.setOwners.accounts({
      multisig: multisig.publicKey,
      multisigSigner,
    }) as Array<web3.AccountMeta>

    // Now that we've reached the threshold, send the transactoin.
    await program.methods
      .executeTransaction()
      .accounts({
        multisig: multisig.publicKey,
        multisigSigner,
        transaction: transaction.publicKey,
      })
      .remainingAccounts(
        setOwnerAccounts
          // Change the signer status on the vendor signer since it's signed by the program, not the client.
          .map((meta) => (meta.pubkey.equals(multisigSigner) ? { ...meta, isSigner: false } : meta))
          .concat({
            pubkey: program.programId,
            isWritable: false,
            isSigner: false,
          }),
      )
      .rpc()

    multisigAccount = await program.account.multisig.fetch(multisig.publicKey)
    console.log(multisigAccount)
  })
})

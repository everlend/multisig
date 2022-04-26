import { Program, workspace } from '@project-serum/anchor'
import { SerumMultisig } from '../target/types/serum_multisig'

export const program = workspace.SerumMultisig as Program<SerumMultisig>

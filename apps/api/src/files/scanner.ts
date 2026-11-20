import { connect } from 'node:net'

export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'ERROR'
  engine: 'BASIC' | 'CLAMAV'
}

export interface Scanner {
  scan(bytes: Buffer): Promise<ScanResult>
}

/**
 * The industry test signature (EICAR), assembled at runtime so this source file itself is
 * never flagged by an antivirus on a developer machine.
 */
const EICAR = Buffer.from(
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join(''),
  'latin1',
)

/**
 * Built-in checks (ADR 0008, default, no setup): the real file type, content rules and
 * re-encoding are enforced by the processors; this step only blocks the standard test
 * signature so the "infected" path can be exercised safely. Recorded as engine BASIC.
 */
export class BasicScanner implements Scanner {
  async scan(bytes: Buffer): Promise<ScanResult> {
    return { status: bytes.includes(EICAR) ? 'INFECTED' : 'CLEAN', engine: 'BASIC' }
  }
}

/**
 * ClamAV daemon over TCP (INSTREAM). Any connection problem, timeout or unexpected
 * answer is ERROR - never CLEAN (doc 07 fail-safe, TB-FILE-005).
 */
export class ClamdScanner implements Scanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  scan(bytes: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const done = (status: ScanResult['status']) => {
        socket.destroy()
        resolve({ status, engine: 'CLAMAV' })
      }
      const socket = connect({ host: this.host, port: this.port })
      socket.setTimeout(this.timeoutMs, () => done('ERROR'))
      socket.on('error', () => done('ERROR'))
      let reply = ''
      socket.on('data', (chunk) => {
        reply += chunk.toString('utf8')
      })
      socket.on('end', () => {
        const answer = reply.replace(/\0/g, '').trim()
        if (/^stream: OK$/.test(answer)) done('CLEAN')
        else if (/FOUND$/.test(answer)) done('INFECTED')
        else done('ERROR')
      })
      socket.on('connect', () => {
        socket.write('zINSTREAM\0')
        const chunkSize = 64 * 1024
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.subarray(offset, offset + chunkSize)
          const size = Buffer.alloc(4)
          size.writeUInt32BE(chunk.length)
          socket.write(size)
          socket.write(chunk)
        }
        socket.write(Buffer.alloc(4)) // zero-length chunk = end of stream
      })
    })
  }
}

import { fileAttachSchema } from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { selectOne, withTransaction, type Db } from '../db/tx.js'
import { assertAttachable, linkFiles, unlinkFile } from '../files/attach.js'
import { attachedFiles } from '../files/dto.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

async function loadExecution(db: Db, projectId: string, executionId: string) {
  const row = await selectOne<{ id: string; tester_id: string | null; run_status: string }>(
    db,
    `SELECT e.id, e.tester_id, r.status_code AS run_status
       FROM test_executions e
       JOIN test_run_cases trc ON trc.id = e.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
      WHERE e.id = ? AND r.project_id = ?`,
    [executionId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

/**
 * Evidence on an existing attempt: the tester who recorded it (or a lead) may add files
 * later; only leads may detach. A LOCKED run is final.
 */
export function executionRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.post('/:executionId/files', requirePermission('file.upload'), async (c) => {
    const project = c.get('project')
    const executionId = idParam(c, 'executionId')
    const body = await parseBody(c, fileAttachSchema)
    const isLead = project.role === 'ADMIN' || project.role === 'QA_LEAD'
    await withTransaction(pool, async (conn) => {
      const execution = await loadExecution(conn, project.id, executionId)
      if (!isLead && String(execution.tester_id) !== c.get('auth')?.userId) {
        throw new AppError(403, 'FORBIDDEN', 'Only the tester of this attempt can add evidence.')
      }
      if (execution.run_status === 'LOCKED') {
        throw new AppError(409, 'CONFLICT', 'The run is locked and cannot be changed.')
      }
      await assertAttachable(conn, project.id, body.files)
      const added = await linkFiles(conn, 'execution', executionId, body.files)
      if (added > 0) {
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_execution',
          entityId: executionId,
          action: 'UPDATE',
          newValues: { attached_file_ids: body.files.map((f) => f.file_id) },
        })
      }
    })
    const files = await attachedFiles(pool, 'execution', [executionId])
    return c.json(files.get(executionId) ?? [], 201)
  })

  routes.delete('/:executionId/files/:fileId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const executionId = idParam(c, 'executionId')
    const fileId = idParam(c, 'fileId')
    await withTransaction(pool, async (conn) => {
      const execution = await loadExecution(conn, project.id, executionId)
      if (execution.run_status === 'LOCKED') {
        throw new AppError(409, 'CONFLICT', 'The run is locked and cannot be changed.')
      }
      if (!(await unlinkFile(conn, 'execution', executionId, fileId))) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.')
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_execution',
        entityId: executionId,
        action: 'UPDATE',
        oldValues: { attached_file_id: fileId },
      })
    })
    return c.body(null, 204)
  })

  return routes
}

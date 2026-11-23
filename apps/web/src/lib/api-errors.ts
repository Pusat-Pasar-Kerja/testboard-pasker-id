import type { TFunction } from 'i18next'
import { ApiClientError } from '../services/api-client'

/**
 * The API answers in English (for logs and developers); people read Indonesian. Every
 * message the server can send is mapped to plain words here, and anything unknown falls
 * back to a calm general sentence for its error code, so no English reaches the screen
 * (owner audit, 2026-11-24). Keys live under errors.server.* in the translation files.
 */
const SERVER_TEXT: Record<string, ServerTextKey> = {
  'This account already has an active reset link.': 'resetLinkActive',
  'The run is locked and cannot be changed.': 'runLocked',
  'The file is larger than allowed.': 'fileTooLarge',
  'The upload is larger than allowed.': 'fileTooLarge',
  'Empty upload.': 'chooseFile',
  'Project code already exists.': 'codeUsed',
  'Module code already exists in this project.': 'codeUsed',
  'Cycle code already exists in this project.': 'codeUsed',
  'Test case code already exists in this project.': 'codeUsed',
  'Run code already exists in this project.': 'codeUsed',
  'This bug code is already used.': 'codeUsed',
  'An account with this e-mail already exists.': 'emailUsed',
  'Your role cannot move this bug to that status.': 'statusNotAllowed',
  'Your role cannot archive test cases.': 'noPermission',
  'You do not have permission to perform this action.': 'noPermission',
  'Super Admin only.': 'superAdminOnly',
  'Admin only.': 'adminOnly',
  'Too many rows; narrow the filters.': 'tooManyRows',
  'This user is already a member.': 'alreadyMember',
  'This test case is assigned to someone else.': 'assignedToOther',
  'This table has no test run yet.': 'tableNoRun',
  'This table already has answers; block it instead.': 'tableHasAnswers',
  'This project is archived and read-only.': 'projectArchived',
  'This import is not ready to be applied.': 'importNotReady',
  'This import can no longer be changed.': 'importLocked',
  'An applied import is kept as history.': 'importLocked',
  'This file is not available.': 'fileUnavailable',
  'The uploaded file is no longer available.': 'fileUnavailable',
  'The test run is not open.': 'runNotActive',
  'Tests can only be recorded while the run is ACTIVE.': 'runNotActive',
  'Restore the archived test case before editing it.': 'caseArchived',
  'The kept test case is archived.': 'caseArchived',
  'Only the uploader or a lead can remove this file.': 'fileNotYours',
  'Only the uploader or a lead can detach this file.': 'fileNotYours',
  'Only the tester of this attempt can add evidence.': 'evidenceNotYours',
  'Only the assigned developer can add evidence.': 'evidenceNotYours',
  'Only an ADMIN or QA_LEAD can assign a bug.': 'assignAdminOnly',
  'At least one active Super Admin must remain.': 'lastSuperAdmin',
  'Activate the account before issuing a link.': 'accountInactive',
  'A table with this name already exists in this cycle.': 'tableNameUsed',
  'The request belongs to another account.': 'requestOtherAccount',
  'Request origin is not allowed.': 'reload',
  'Missing or invalid CSRF token.': 'reload',
  // Field details
  NO_ACCOUNT: 'noAccount',
  NOT_A_PERSON: 'notAPerson',
  RUN_NOT_ACTIVE: 'runNotActive',
  HAS_ACTIVITY: 'tableHasAnswers',
  EXPORT_TOO_LARGE: 'tooManyRows',
  REQUEST_OTHER_ACCOUNT: 'requestOtherAccount',
  PROJECT_ARCHIVED: 'projectArchived',
  PERMANENT_SUPER_ADMIN: 'permanentSuperAdmin',
  RESET_LINK_ACTIVE: 'resetLinkActive',
  ACCOUNT_INACTIVE: 'accountInactive',
  'Already used': 'codeUsed',
  'Not allowed for your role': 'noPermission',
  'Current password is incorrect': 'wrongPassword',
  'End date must not be before the start date': 'endBeforeStart',
  'Password must not contain your e-mail name': 'passwordHasEmail',
  'Assignee must be an active ADMIN, QA_LEAD or TESTER member': 'assigneeNotMember',
  'Only an ADMIN or QA_LEAD can assign a bug': 'assignAdminOnly',
  'Cycle not found in this project': 'notInProject',
  'Module not found in this project': 'notInProject',
  'Suite not found in this project': 'notInProject',
  'Not a feature of this table': 'notTableFeature',
  'Choose a file': 'chooseFile',
  'Choose at least one file': 'chooseFile',
  'Unknown account': 'unknownAccount',
}

type ServerTextKey =
  | 'resetLinkActive'
  | 'runLocked'
  | 'fileTooLarge'
  | 'chooseFile'
  | 'codeUsed'
  | 'emailUsed'
  | 'statusNotAllowed'
  | 'noPermission'
  | 'superAdminOnly'
  | 'adminOnly'
  | 'tooManyRows'
  | 'alreadyMember'
  | 'assignedToOther'
  | 'tableNoRun'
  | 'tableHasAnswers'
  | 'projectArchived'
  | 'importNotReady'
  | 'importLocked'
  | 'fileUnavailable'
  | 'runNotActive'
  | 'caseArchived'
  | 'fileNotYours'
  | 'evidenceNotYours'
  | 'assignAdminOnly'
  | 'lastSuperAdmin'
  | 'accountInactive'
  | 'tableNameUsed'
  | 'requestOtherAccount'
  | 'reload'
  | 'noAccount'
  | 'notAPerson'
  | 'permanentSuperAdmin'
  | 'wrongPassword'
  | 'endBeforeStart'
  | 'passwordHasEmail'
  | 'assigneeNotMember'
  | 'notInProject'
  | 'notTableFeature'
  | 'unknownAccount'

/** Plain-words text for one server message or detail code, or null when unknown. */
export function serverText(t: TFunction, message: string | undefined): string | null {
  const key = message ? SERVER_TEXT[message] : undefined
  return key ? t(`errors.server.${key}`) : null
}

/** User-facing text for a failed request, always in the reader's language. */
export function apiErrorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiClientError) {
    return (
      serverText(t, error.details[0]?.message) ??
      serverText(t, error.message) ??
      t(`errors.${error.code}`)
    )
  }
  return t('errors.INTERNAL_ERROR')
}

/** Field -> server detail (raw) for a 422/409 response; translate with serverText. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiClientError ? error.fieldErrors() : {}
}

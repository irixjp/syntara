/**
 * E2E: Execution detail — interactive form prompt response side panel
 *
 * Mock seed: syntara-mock-api/src/resources/formPrompts.ts (exec-form-prompt).
 */
import { createUnavailableGuard, test, expect, toAppUrl, type Page } from '../fixtures'
import {
  FORM_PROMPT_NAV_STEP_TIMEOUT,
  openExecutionFormPromptDeepLink,
  waitForFormPromptPanel,
} from '../helpers/formPromptPanel'
import { createPendingFormPromptLight, MOCK_FORM_RESPONSE_SEED } from '../helpers/formResponses'
import { clickWhenEnabled, pfWidget } from '../helpers/patternfly'
import { apiRequest, deleteWorkflowViaApi } from '../utils/api'

const SEED = MOCK_FORM_RESPONSE_SEED

test.describe('Execution detail — Form prompt side panel', { tag: '@pr-check' }, () => {
  const seedGuard = createUnavailableGuard(
    'Form prompt execution seed required (see syntara-mock-api formPrompts / exec-form-prompt)'
  )

  async function expectSeedPanelReady(app: Page): Promise<void> {
    try {
      await openExecutionFormPromptDeepLink(app, SEED.executionId, SEED.pendingId, {
        expectedMessage: SEED.pendingMessage,
      })
      await expect(app.getByRole('textbox', { name: 'Reason' })).toBeVisible({ timeout: 15_000 })
    } catch {
      seedGuard.markUnavailable()
      expect(
        false,
        'Form prompt execution seed required (see syntara-mock-api formPrompts / exec-form-prompt)'
      ).toBeTruthy()
    }
  }

  test('deep-link opens the panel with prompt summary and form fields', async ({ app }) => {
    await expectSeedPanelReady(app)

    await expect(app.getByText('Prompt step', { exact: true })).toBeVisible()
    await expect(app.getByText(SEED.pendingMessage)).toBeVisible()
    await expect(app.getByRole('textbox', { name: 'Reason' })).toBeVisible()
    await expect(app.getByRole('button', { name: 'Submit response' })).toBeVisible()
  })

  test('shows validation error when submitting without required fields', async ({ app }) => {
    await expectSeedPanelReady(app)

    await app.getByRole('button', { name: 'Submit response' }).click()
    await expect(app.getByText('This field is required')).toBeVisible({ timeout: 10_000 })
    await expect(pfWidget(app, 'Alert').filter({ hasText: 'Form submitted' })).not.toBeVisible()
  })

  test('activity table row opens the waiting prompt panel', async ({ app }) => {
    await app.goto(toAppUrl(`/executions/${SEED.executionId}`))
    await expect(app.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    const activityTable = app.getByRole('grid', { name: 'Activity states' })
    await expect(activityTable).toBeVisible({ timeout: 15_000 })

    await activityTable.getByRole('row').filter({ hasText: 'Collect operator input' }).click()

    await waitForFormPromptPanel(app)
    await expect(app.getByText(SEED.pendingMessage)).toBeVisible()
  })

  test('Respond to prompt toolbar action opens the panel', async ({ app }) => {
    await app.goto(toAppUrl(`/executions/${SEED.executionId}`))
    await expect(app.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    const panelHeading = app.getByRole('heading', { name: 'Respond to prompt' })
    const respondButton = app.getByRole('button', { name: 'Respond to prompt' })

    await expect(async () => {
      if (await panelHeading.isVisible().catch(() => false)) {
        await expect(app.getByText(SEED.pendingMessage)).toBeVisible()
        return
      }
      await clickWhenEnabled(respondButton, { timeout: 10_000 })
      await waitForFormPromptPanel(app)
      await expect(app.getByText(SEED.pendingMessage)).toBeVisible()
    }).toPass({ timeout: 45_000, intervals: [2_000] })
  })

  test('closes the panel with the close control', async ({ app }) => {
    await expectSeedPanelReady(app)

    await app.getByRole('button', { name: 'Close form prompt panel' }).click()
    await expect(app.getByRole('heading', { name: 'Respond to prompt' })).not.toBeVisible({ timeout: 10_000 })
  })

  test('navigates between prompts with previous and next', async ({ app }) => {
    const panelHeading = app.getByRole('heading', { name: 'Respond to prompt' })
    const prevButton = app.getByRole('button', { name: 'Previous prompt' })
    const nextButton = app.getByRole('button', { name: 'Next prompt' })

    const deepLink = toAppUrl(`/executions/${SEED.executionId}?form_prompt=${SEED.pendingId}&history=closed`)

    await expect(async () => {
      await app.goto(deepLink)
      await waitForFormPromptPanel(app, { expectedMessage: SEED.pendingMessage })

      const counter = panelHeading.getByText(/\d+ of \d+/)
      await expect(counter).toBeVisible({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
      const counterText = await counter.textContent()
      expect(counterText).toMatch(/1 of \d+/)

      await expect(prevButton).toBeDisabled({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })

      await clickWhenEnabled(nextButton, { timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
      await expect(panelHeading.getByText(/2 of \d+/)).toBeVisible({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
      await expect(app.getByText(SEED.pendingMessage)).not.toBeVisible({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })

      await clickWhenEnabled(prevButton, { timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
      await expect(panelHeading.getByText(/1 of \d+/)).toBeVisible({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
      await expect(app.getByText(SEED.pendingMessage)).toBeVisible({ timeout: FORM_PROMPT_NAV_STEP_TIMEOUT })
    }).toPass({ timeout: 60_000, intervals: [3_000] })
  })
})

test.describe('Execution detail — Form prompt side panel (viewer)', { tag: '@pr-check' }, () => {
  test('viewer sees the form as read-only without a submit action', async ({ viewerApp }) => {
    await openExecutionFormPromptDeepLink(viewerApp, SEED.executionId, SEED.pendingId, {
      expectedMessage: SEED.pendingMessage,
    })
    await expect(viewerApp.getByRole('textbox', { name: 'Reason' })).toBeDisabled({ timeout: 20_000 })
    await expect(viewerApp.getByRole('button', { name: 'Submit response' })).not.toBeVisible()
  })
})

test.describe('Execution detail — Form prompt submit (API-created)', { tag: '@pr-check' }, () => {
  test('submits a pending prompt and shows success feedback', async ({ app }) => {
    const created = await createPendingFormPromptLight(app, 'e2e-panel-submit')

    try {
      await openExecutionFormPromptDeepLink(app, created.executionId, created.formPromptId)

      await app.getByRole('textbox', { name: 'Answer' }).fill('E2E panel submit')
      await app.getByRole('button', { name: 'Submit response' }).click()

      await expect(pfWidget(app, 'Alert').filter({ hasText: 'Form submitted' })).toBeVisible({ timeout: 15_000 })
      await expect(app.getByRole('heading', { name: 'Respond to prompt' })).not.toBeVisible({ timeout: 15_000 })
    } finally {
      await deleteWorkflowViaApi(app, created.workflowId)
    }
  })

  test('shows an error alert when the submit API fails', async ({ app }) => {
    const created = await createPendingFormPromptLight(app, 'e2e-panel-submit-fail')

    try {
      await app.route('**/form_prompts/*/submit', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'https://api.example.com/errors/internal',
            title: 'Internal Server Error',
            detail: 'Simulated submit failure for E2E',
            code: 'INTERNAL_ERROR',
            retryable: true,
          }),
        })
      })

      await openExecutionFormPromptDeepLink(app, created.executionId, created.formPromptId)

      await app.getByRole('textbox', { name: 'Answer' }).fill('E2E submit failure probe')
      await app.getByRole('button', { name: 'Submit response' }).click()

      await expect(pfWidget(app, 'Alert').filter({ hasText: 'Failed to submit form' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(pfWidget(app, 'Alert').filter({ hasText: 'Form submitted' })).not.toBeVisible()
      await expect(app.getByRole('button', { name: 'Submit response' })).toBeVisible()
    } finally {
      await deleteWorkflowViaApi(app, created.workflowId)
    }
  })

  test('submitted prompt shows read-only response data', async ({ app }) => {
    const created = await createPendingFormPromptLight(app, 'e2e-panel-readonly')
    const answer = 'Read-only E2E response'

    try {
      const submitResp = await apiRequest(app, 'post', `/form_prompts/${created.formPromptId}/submit`, {
        data: { response_data: { answer } },
      })
      expect(submitResp.ok(), `submit returned ${submitResp.status()}`).toBeTruthy()

      await openExecutionFormPromptDeepLink(app, created.executionId, created.formPromptId)

      await expect(app.getByText('Submitted response', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(app.getByText(answer)).toBeVisible()
      await expect(app.getByRole('button', { name: 'Submit response' })).not.toBeVisible()
    } finally {
      await deleteWorkflowViaApi(app, created.workflowId)
    }
  })
})

import { test, expect } from '@playwright/test';

test.describe('Trainers SuperApp E2E Flow', () => {
  test('should login, navigate, and verify Profiler data integrity with custom duplicate errors', async ({ page }) => {
    // 1. Visit the landing page
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('response', async response => {
      if (response.status() >= 400) {
        try {
          console.log(`API ERROR [${response.status()}] ${response.url()}:`, await response.text());
        } catch (_) {
          // Ignore parsing errors for responses without body
        }
      }
    });

    await page.goto('/');
    
    // Expect the page to have the title/header text of Trainers SuperApp
    await expect(page).toHaveTitle(/Trainers SuperApp/i);

    // 2. Open the login modal
    const loginBtn = page.locator('button:has-text("Masuk ke Platform")');
    await expect(loginBtn).toBeVisible();
    await loginBtn.click();

    // 3. Fill in trainer/admin credentials
    await page.fill('input[name="email"]', 'rina.wijaya@bankmuamalat.co.id');
    await page.fill('input[name="password"]', 'password123');

    // Click 'Masuk sekarang' submit button
    const submitBtn = page.locator('button.auth-submit');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // 4. Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    
    // Verify that we are on the dashboard
    await expect(page.locator('h1', { hasText: 'Pusat Kendali' })).toBeVisible();

    // 5. Navigate to the Profiler page
    const profilerLink = page.getByRole('link', { name: 'KTP', exact: true });
    await expect(profilerLink).toBeVisible();
    await profilerLink.click();

    // Wait for the URL to change to /profiler
    await page.waitForURL('**/profiler');
    await expect(page.locator('h1', { hasText: 'Kotak Tool Profil' })).toBeVisible();

    // 6. Select "Tim OM" folder on the sidebar
    const folderOMBtn = page.locator('button:has-text("Tim OM")');
    await expect(folderOMBtn).toBeVisible();
    await folderOMBtn.click();

    // 7. Click on "Tambah Peserta" card to navigate to form
    const addCard = page.locator('a:has-text("Tambah Peserta")');
    await expect(addCard).toBeVisible();
    await addCard.click();

    // Wait for the form page
    await page.waitForURL('**/profiler/add*');
    await expect(page.locator('h2')).toContainText(/Tambah Peserta/i);

    // Generate a unique name to ensure first insert succeeds
    const uniqueName = `E2E_Agent_${Math.random().toString(36).substring(2, 10)}`;

    // 8. Fill in form fields and save
    await page.locator('label:has-text("Nama *") input').fill(uniqueName);
    await page.locator('label:has-text("Tim *") input').fill('E2ETestTeam');
    await page.locator('label:has-text("Jabatan *") input').fill('E2ETestRole');

    // Click "Simpan Peserta" button
    const saveBtn = page.locator('button:has-text("Simpan Peserta")');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // 9. Verify redirection back to Table view and verify record exists
    await page.waitForURL('**/profiler/table*');
    await expect(page.locator('h2')).toContainText(/Tabel Peserta/i);
    await expect(page.locator('table')).toContainText(uniqueName);

    // 10. Click "+ Tambah" button on Table page to add the duplicate participant
    const addBtn = page.locator('a:has-text("+ Tambah")');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    await page.waitForURL('**/profiler/add*');

    // Fill in the exact same name under the same batch
    await page.locator('label:has-text("Nama *") input').fill(uniqueName);
    await page.locator('label:has-text("Tim *") input').fill('E2ETestTeam');
    await page.locator('label:has-text("Jabatan *") input').fill('E2ETestRole');

    // Click save button again
    await page.locator('button:has-text("Simpan Peserta")').click();

    // 11. Assert that the server database check correctly throws and is mapped to a human-friendly message
    const errorAlert = page.locator('p.text-red-700');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText(/sudah terdaftar di batch/i);
  });
});

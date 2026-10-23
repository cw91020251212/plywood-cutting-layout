"""Verify the selected Chinese-only copy removal on a local mobile preview."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('/workspace/plywood-copy-cleanup-results')
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 320, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    response = page.goto('http://127.0.0.1:8891/')
    assert response.status == 200
    page.wait_for_function('window.calculator && typeof calculator._translatePageTo === "function"')
    selectors = ['#tableSawWorkflowHint', '.output-heading', '#trialResults > .trial-empty']
    def check_chinese():
        assert page.locator('html').get_attribute('lang') == 'zh-Hant'
        for selector in selectors:
            assert page.locator(selector).count() == 1
            assert not page.locator(selector).is_visible(), selector
        assert page.locator('#calculateButton').is_visible()
        assert '計算' in page.locator('#calculateButton').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    check_chinese()
    page.locator('#section-results').evaluate('(e) => e.scrollIntoView({block:"start"})')
    page.screenshot(path=str(out / 'mobile-320x844-chinese-cleanup.png'))
    page.locator('#languageSwitchButton').click()
    page.wait_for_function('document.documentElement.lang === "en"')
    for selector in selectors:
        assert page.locator(selector).is_visible(), selector
    assert 'Table-saw note:' in page.locator('#tableSawWorkflowHint').inner_text()
    assert page.locator('.output-heading h2').inner_text() == 'Layout'
    assert 'View the layout for each sheet.' in page.locator('.output-heading').inner_text()
    assert 'Add parts and sheets, then select Calculate.' in page.locator('#trialResults').inner_text()
    page.evaluate('calculator.resetResults()')
    page.wait_for_function('document.querySelector("#trialResults").textContent.includes("Add parts and sheets")')
    assert page.locator('#trialResults > .trial-empty').is_visible()
    page.locator('#languageSwitchButton').click()
    page.wait_for_function('document.documentElement.lang === "zh-Hant"')
    page.evaluate('calculator.resetResults()')
    check_chinese()
    page.get_by_role('textbox', name='部件長度（毫米）', exact=True).fill('440')
    page.get_by_role('textbox', name='部件闊度（毫米）', exact=True).fill('300')
    page.get_by_role('textbox', name='部件數量', exact=True).fill('2')
    page.locator('#section-parts').get_by_role('button', name='新增', exact=True).click()
    page.get_by_role('textbox', name='原板長度（毫米）', exact=True).fill('2440')
    page.get_by_role('textbox', name='原板闊度（毫米）', exact=True).fill('1220')
    page.locator('#section-boards').get_by_role('button', name='新增', exact=True).click()
    page.locator('#calculateButton').click()
    page.wait_for_function('calculator.trialPlan && calculator.trialPlan.validation.ok', timeout=30000)
    assert page.evaluate('calculator.trialPlan.summary.placedParts') == 2
    assert page.locator('#canvasContainer canvas').count() >= 1
    assert not errors, errors
    result = {'viewport': {'width': 320, 'height': 844}, 'chinese_copy_removed': True, 'english_copy_preserved': True, 'language_roundtrip_and_reset': True, 'calculation_validated': True, 'placed_parts': 2, 'page_errors': errors}
    (out / 'regression-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()

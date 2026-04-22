// 국내 거래처 DB 전체 교체 스크립트 (ESA001M.xlsx 기준)
// 실행: node scripts/replace-clients.js
// 주의: clients 테이블 데이터를 전부 삭제하고 엑셀 내용으로 다시 채움

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL = 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EXCEL_PATH = path.join(__dirname, '..', 'ESA001M.xlsx');
const BATCH_SIZE = 500;

function classifyCategory(group) {
    const s = (group || '').toString();
    if (s.includes('특판')) return '매출처';
    if (s.includes('공급')) return '매입처';
    return '';
}

function parseExcel() {
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 헤더 행 찾기 — '사업자등록번호'가 포함된 행
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        if (rows[i].map(x => (x || '').toString()).includes('사업자등록번호')) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx === -1) throw new Error('헤더 행을 찾지 못했습니다');

    // 헤더 매핑: [사업자등록번호, 거래처명, 대표자명, 전화, Fax, 모바일, Email, 우편번호, 주소, 업종, 업태, 거래처그룹1명]
    // Excel 컬럼 인덱스는 원본 파일 기준이 아니라 sheet_to_json의 배열 인덱스 (0부터)
    const COL = {
        businessNo: 0,
        companyName: 1,
        ceo: 2,
        phone: 3,
        fax: 4,
        mobile: 5,
        email: 6,
        zipcode: 7,
        address: 8,
        bizItem: 9,       // 업종
        bizType: 10,      // 업태
        group: 11         // 거래처그룹1명
    };

    const dataRows = rows.slice(headerIdx + 1);
    const records = [];
    for (const r of dataRows) {
        const companyName = (r[COL.companyName] || '').toString().trim();
        if (!companyName) continue;
        const group = (r[COL.group] || '').toString().trim();
        records.push({
            business_no: (r[COL.businessNo] || '').toString().trim(),
            company_name: companyName,
            ceo: (r[COL.ceo] || '').toString().trim(),
            phone: (r[COL.phone] || '').toString().trim(),
            fax: (r[COL.fax] || '').toString().trim(),
            mobile: (r[COL.mobile] || '').toString().trim(),
            email: (r[COL.email] || '').toString().trim(),
            zipcode: (r[COL.zipcode] || '').toString().trim(),
            address: (r[COL.address] || '').toString().trim(),
            biz_item: (r[COL.bizItem] || '').toString().trim(),
            biz_type: (r[COL.bizType] || '').toString().trim(),
            staff_name: '',
            staff_mobile: '',
            staff_email: '',
            grade: '',
            category: classifyCategory(group)
        });
    }
    return records;
}

async function getExistingCount() {
    const { count, error } = await sb.from('clients').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count;
}

async function deleteAll() {
    // .delete()는 WHERE가 필요함. id > 0 조건으로 전체 삭제
    const { error } = await sb.from('clients').delete().gt('id', 0);
    if (error) throw error;
}

async function insertBatches(records) {
    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const { error } = await sb.from('clients').insert(chunk);
        if (error) {
            console.error('배치 ' + (i / BATCH_SIZE + 1) + ' 실패:', error.message);
            throw error;
        }
        inserted += chunk.length;
        process.stdout.write(`\r  삽입 진행: ${inserted} / ${records.length}`);
    }
    process.stdout.write('\n');
    return inserted;
}

(async () => {
    try {
        console.log('[1/4] Excel 파싱 중...');
        const records = parseExcel();
        const byCat = { 매출처: 0, 매입처: 0, 공란: 0 };
        records.forEach(r => byCat[r.category || '공란']++);
        console.log(`  파싱 완료: ${records.length}건 (매출처 ${byCat.매출처} / 매입처 ${byCat.매입처} / 공란 ${byCat.공란})`);

        console.log('[2/4] 기존 DB 건수 조회...');
        const existing = await getExistingCount();
        console.log(`  현재 clients 테이블: ${existing}건`);

        console.log('[3/4] 기존 clients 전체 삭제...');
        await deleteAll();
        const afterDelete = await getExistingCount();
        console.log(`  삭제 후 잔여: ${afterDelete}건 (0이어야 함)`);
        if (afterDelete !== 0) throw new Error('삭제가 완전하지 않습니다');

        console.log('[4/4] 신규 데이터 배치 삽입 (' + BATCH_SIZE + '건씩)...');
        const inserted = await insertBatches(records);
        const finalCount = await getExistingCount();
        console.log(`\n✅ 완료: 삽입 ${inserted}건 / 최종 DB ${finalCount}건`);
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exit(1);
    }
})();

-- 062: 회사 매뉴얼 (2026-10-16 현호님 요청 — '회사 매뉴얼' 메뉴 오픈)
--  카테고리별 글 + 검색. 직원 누구나 작성·수정 (마지막 수정자 표시). 회사별 칸막이(company_id + RLS)
--  본문은 HTML(Quill). 사진은 base64 대신 planning-images 저장소에 올리고 주소만 저장 (목록은 본문 없이 가볍게)
create table if not exists manuals (
    id bigserial primary key,
    category text not null default '기타',
    title text not null default '',
    content text not null default '',
    pinned boolean not null default false,
    sort_order int not null default 0,
    created_by text default '',
    updated_by text default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
create index if not exists manuals_company_idx on manuals(company_id, category, sort_order);

drop trigger if exists trg_manuals_company on manuals;
create trigger trg_manuals_company before insert on manuals
    for each row execute function set_company_id();

alter table manuals enable row level security;
drop policy if exists manuals_company on manuals;
create policy manuals_company on manuals for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
revoke all on manuals from anon;
grant select, insert, update, delete on manuals to authenticated;
grant usage, select on sequence manuals_id_seq to authenticated;

do $$ begin
    alter publication supabase_realtime add table manuals;
exception when duplicate_object then null; end $$;

-- 초안 (KLP = company_id 1, 아직 글이 없을 때만)
insert into manuals (company_id, category, title, pinned, sort_order, created_by, updated_by, content)
select 1, v.category, v.title, v.pinned, v.sort_order, '초안', '초안', v.content
from (values
('신입 온보딩', '대시보드 시작하기', true, 1, $h$
<h2>로그인</h2>
<ul><li>주소: <b>klp-work-dashboard.vercel.app</b> (북마크·홈 화면 앱으로 저장해 두세요)</li><li><b>이름</b>과 비밀번호로 로그인합니다. 비밀번호를 잊으면 관리자에게 새 비밀번호를 요청하세요 (예전 비밀번호는 아무도 볼 수 없습니다)</li><li>왼쪽 아래 <b>비밀번호 변경</b>에서 직접 바꿀 수 있습니다</li></ul>
<h2>메뉴 구성</h2>
<ul><li><b>홈</b> — 오늘 할 일·마감·요약</li><li><b>프로젝트</b> — 회사/개인/펀딩 프로젝트 (할 일·자료·제안, 펀딩은 사양 체크)</li><li><b>매입매출</b> — 상담·견적 → 국내 / 해외 주문 진행</li><li><b>일일계획표·내 하루</b> — 매일 할 일</li><li><b>회의록, 택배 관리, 마케팅</b></li><li><b>제안서·상품 DB, 거래처</b>, <b>견적서 만들기</b>, <b>마진 계산기</b></li></ul>
<h2>꼭 알아둘 것</h2>
<ul><li>화면이 이상하거나 새 기능이 안 보이면 <b>새로고침 ⌘+Shift+R</b> (윈도우 Ctrl+F5)</li><li><b>알림 켜기</b>를 눌러 두면 할 일·마감 알림을 폰/PC로 받습니다</li><li>오른쪽 아래 달 모양 버튼 = 다크 모드</li><li>대부분 화면에 <b>F2</b> = 새로 작성 단축키</li></ul>
$h$),
('업무 프로세스', '주문 진행 전체 흐름 (상담 → 납품·정산)', true, 1, $h$
<p>한 주문은 <b>상담 → 견적 → 수주(국내 등록) → 디자인확인 → 작업요청 → 선금·잔금·계산서·공급처 송금·납품</b> 순서로 진행합니다. 상담 화면 위쪽 <b>진행 단계 막대</b>와 <b>지금 할 일</b> 버튼을 따라가면 됩니다.</p>
<h2>단계별로 하는 일</h2>
<ol><li><b>상담</b>: 매입매출 → 상담·견적 → 상담 탭에서 새 상담(F2). 문의 내용·사진·연락 기록을 남깁니다</li><li><b>견적</b>: 가격 확정 전이면 <b>가견적 안내</b>, 확정이면 <b>이 상담으로 견적 작성</b></li><li><b>수주</b>: 견적이 확정되면 <b>국내로 넘기기</b> → 국내 프로젝트가 생깁니다</li><li><b>디자인확인</b>: 디자인확인서를 만들어 고객 컨펌 → <b>컨펌 완료 체크</b>(채널·날짜 기록)</li><li><b>작업요청</b>: 공장에 작업요청서 발송 → <b>발송 완료 체크</b> (해외 공장은 해외 PO)</li><li><b>정산·납품</b>: 선금 입금, 잔금 입금, 계산서 발행, 공급처 송금, 납품을 각각 체크</li></ol>
<h2>상태는 자동으로 바뀝니다</h2>
<ul><li>국내 프로젝트: 체크가 하나라도 있으면 <b>진행 중</b>, 하나도 없으면 <b>시작 전</b>, 전부 체크하면 <b>완료</b></li><li>상담 상태(수주 → 제작중 → 납품완료 → 정산완료)도 국내 체크에 따라 자동으로 맞춰집니다</li></ul>
$h$),
('업무 프로세스', '상담 등록과 견적·국내 연결', false, 2, $h$
<h2>새 상담</h2>
<ul><li>상담·견적 → <b>상담</b> 탭 → 새 상담(F2). 거래처·담당자·문의 내용·사진을 넣습니다</li><li>이후 통화·메일·카톡 내용은 상담 타임라인에 계속 기록합니다</li></ul>
<h2>견적 연결</h2>
<ul><li><b>+ 이 상담으로 견적 작성</b> — 견적 화면으로 이동해 이 상담에 붙은 견적을 씁니다</li><li><b>🔗 기존 견적 연결</b> — 상담보다 먼저 만들어 둔 견적을 붙입니다 (같은 거래처 견적이 위에)</li><li><b>🔗 기존 국내 연결</b> — 국내 메뉴에서 바로 만든 프로젝트를 이 상담에 붙입니다. 여러 개를 체크해서 한 번에 연결</li></ul>
<p>연결하면 상담 화면에서 디자인확인서·작업요청서 미리보기와 체크를 바로 할 수 있습니다.</p>
$h$),
('업무 프로세스', '견적 작성 (상담·견적 > 견적)', false, 3, $h$
<ul><li><b>맨 위 입력 줄</b>에 쓰고 추가 → 항상 <b>새 견적</b>이 생깁니다 (같은 날·같은 거래처라도 따로)</li><li>기존 견적 <b>아래 '품목 추가' 줄</b> → 그 견적에 품목이 <b>이어서</b> 붙습니다</li><li>인쇄·포장·라벨·택배비까지 자세히 쓰려면 <b>새로 작성</b> 또는 견적의 <b>편집</b></li><li><b>견적서</b> 버튼 → 견적서 미리보기·PDF·보내기(메일/카톡)</li></ul>
<h2>국내로 넘기기</h2>
<ul><li><b>📥 국내 등록</b> — 견적 품목대로 국내 프로젝트를 새로 만듭니다 (수주)</li><li><b>🔗 국내 연결</b> — 국내에 <b>이미 만든</b> 프로젝트와 연결만 합니다 (중복 생성 방지)</li><li>등록된 견적은 <b>✓ 등록 완료</b>로 표시됩니다</li></ul>
$h$),
('업무 프로세스', '국내 프로젝트 관리', false, 4, $h$
<ul><li>한 줄에 <b>매출(고객)과 매입(공장)</b>을 같이 관리합니다. 매출액·매입액·마진은 자동 계산</li><li>편집 창의 <b>🏭 매입처 상세</b>는 항상 보입니다. 매입 정보를 저장하려면 위쪽 <b>매입처(공장) 이름</b>을 꼭 입력하세요</li><li>해외 공장 매입은 <b>🌏 해외 매입</b>을 켜고 달러 단가·환율·부대비용·송금 기록을 넣습니다 (해외 거래처면 자동으로 켜짐)</li><li>체크리스트를 체크하면 상태가 자동으로 바뀝니다 (시작 전 ↔ 진행 중 → 완료)</li></ul>
$h$),
('업무 프로세스', '디자인확인서·작업요청서·해외 PO', false, 5, $h$
<ul><li>국내 프로젝트 또는 상담 화면에서 <b>디자인확인서 만들기</b> / <b>작업요청서 열기·만들기</b> → 문서 생성기가 열리고 프로젝트 내용이 채워집니다</li><li>해외 매입 건은 작업요청서 대신 <b>🌏 해외 PO</b>(영문 발주서)를 씁니다</li><li>저장 파일 이름: <b>날짜_케이엘피코리아_업체명_품명_문서종류</b>. 업체명의 주식회사·(주)·(사) 같은 법인 표기는 자동으로 빠집니다</li><li><b>보내기</b>로 메일·카톡 양식과 PDF 첨부를 한 번에 준비할 수 있습니다</li></ul>
$h$),
('업무 프로세스', '택배 등록과 로젠택배 내보내기', false, 6, $h$
<ul><li>택배 관리 → <b>새 택배(F2)</b>. 받는이·연락처·주소·품목·선/착불 입력</li><li>같은 곳으로 다시 보낼 땐 <b>복제</b> (오늘 날짜로 복사)</li><li><b>로젠택배 내보내기</b> → 로젠 업로드용 엑셀 파일</li><li>운송장번호는 표에서 바로 입력, <b>복사</b> 버튼으로 고객 안내</li><li>오늘 보낼 건은 표에서 색으로 표시됩니다</li></ul>
$h$),
('업무 프로세스', '펀딩 프로젝트 — 사양 체크', false, 7, $h$
<ul><li>프로젝트 → 펀딩 → 프로젝트 열기 → 맨 앞 <b>🧾 사양 체크</b> 탭</li><li>시계 기본 항목 13개(케이스·케이스백·무브먼트·용두·다이얼·핸즈·배터리·밴드·체인·패키지박스·원산지 표기·품질보증서·라벨&amp;택)를 빠짐없이 확인합니다</li><li>항목마다 상태(미정·진행 중·확정·해당 없음), 사양 내용, 메모, <b>📷 사진</b>(원본 화질)</li><li>안 쓰는 항목은 ✕로 빼기(아래 '숨긴 항목'에서 다시 꺼냄), 필요한 항목은 <b>＋ 항목 추가</b></li><li>사진을 누르면 크게 보기 — Esc로 닫기, ←/→로 넘기기</li></ul>
$h$),
('장비 사용법', '회사 서버(맥미니) 안내', false, 1, $h$
<p>대시보드 데이터는 사무실의 <b>맥미니 서버</b>에 저장됩니다 (2026-10 클라우드에서 이전). 대시보드 화면 주소는 그대로입니다.</p>
<h2>지켜 주세요</h2>
<ul><li>맥미니와 옆의 <b>외장 SSD(KLP-Backup)</b>는 <b>끄거나 뽑지 마세요</b></li><li>맥미니의 <b>랜선</b>과 사무실 <b>공유기</b> 전원을 건드리지 마세요</li></ul>
<h2>대시보드가 안 열릴 때</h2>
<ol><li>새로고침(⌘+Shift+R) 후에도 안 되면</li><li>사무실 인터넷이 되는지 확인</li><li>맥미니 전원이 켜져 있는지 확인 (정전 후엔 자동으로 다시 켜집니다)</li><li>그래도 안 되면 김현호에게 연락 — 서버 감시 알림도 함께 받습니다</li></ol>
<p>백업은 매일 새벽 자동(맥미니·외장 SSD·구글 드라이브 암호화)이고, 매월 복구 점검도 자동입니다.</p>
$h$),
('기타', '매뉴얼 작성 방법', false, 1, $h$
<ul><li>누구나 <b>＋ 새 글</b>로 작성하고 <b>편집</b>으로 고칠 수 있습니다. 마지막 수정한 사람과 날짜가 표시됩니다</li><li>카테고리: 업무 프로세스 / 장비 사용법 / 신입 온보딩 / 회사 규정 / 기타</li><li>사진은 붙여넣기·끌어다 놓기·사진 버튼으로 넣습니다</li><li>자주 보는 글은 <b>📌 고정</b>으로 카테고리 맨 위에</li><li>이 초안들은 실제 업무에 맞게 자유롭게 고쳐 주세요</li></ul>
$h$)
) as v(category, title, pinned, sort_order, content)
where not exists (select 1 from manuals where company_id = 1);

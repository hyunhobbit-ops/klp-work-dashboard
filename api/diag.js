// 임시 진단: 환경변수 설정 여부/길이만 반환 (값은 노출하지 않음). 확인 후 삭제 예정.
module.exports = (req, res) => {
  res.status(200).json({
    cron_set: !!process.env.CRON_SECRET,
    cron_len: (process.env.CRON_SECRET || '').length,
    service_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    service_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
    vapid_set: !!process.env.VAPID_PRIVATE_KEY,
    vapid_len: (process.env.VAPID_PRIVATE_KEY || '').length,
  });
};

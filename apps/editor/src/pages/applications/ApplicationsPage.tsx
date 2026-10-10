import { useState } from 'react';

import { ApplicationForm } from './ApplicationForm.tsx';
import { ApplicationRow } from './ApplicationRow.tsx';
import { appliedVersionCount, today } from './model.ts';
import { useApplications } from './useApplications.ts';

/**
 * 投遞紀錄（F09、R3、D19）：記錄每次投遞與實際投出的匯出版本。
 * 匯出不等於投遞；這裡只是記錄，RoleCraft 不會代你投遞或送出任何東西（D7）。
 */
export function ApplicationsPage() {
  const data = useApplications();
  // 新增成功後換 key，表單回到空白
  const [formKey, setFormKey] = useState(0);
  const retained = appliedVersionCount(data.applications);

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">投遞</h1>
      <p>
        記錄每次投遞與實際投出的匯出版本。匯出 PDF 不等於已投遞；RoleCraft
        不會代你投遞或送出任何東西，請自己在求職網站投遞後再回來記錄。
      </p>
      <p role="note">站內履歷投遞（只能填站內履歷、不能附 PDF 的情況，D20）尚未實作。</p>

      <h2>新增投遞紀錄</h2>
      {data.loading ? (
        <p role="status">讀取中…</p>
      ) : data.versionsError ? (
        <p role="alert">無法取得匯出版本，暫時不能新增：{data.versionsError}</p>
      ) : data.versions.length === 0 ? (
        <p role="status">還沒有匯出版本。實際投出只能選匯出版本，請先到「履歷」頁匯出 PDF。</p>
      ) : (
        <ApplicationForm
          key={formKey}
          name="新增投遞紀錄"
          initial={{
            initiation: 'proactive',
            date: today(),
            status: '已投遞',
            exportVersionId: '',
          }}
          versions={data.versions}
          submitLabel="記錄投遞"
          onSubmit={async (fields) => {
            const message = await data.create(fields);
            if (!message) setFormKey((k) => k + 1);
            return message;
          }}
        />
      )}

      <h2>投遞紀錄</h2>
      <p aria-label="已投遞版本數">
        {`已投遞的匯出版本：${String(retained)} 份。`}
        {`刪除素材（事實項、來源文件、履歷版本、職缺快照）時，這 ${String(retained)} 份會保留該素材的副本；`}
        未投遞的匯出版本整份刪除（D19）。
      </p>
      {data.applicationsError ? (
        <p role="alert">無法取得投遞紀錄：{data.applicationsError}</p>
      ) : (
        !data.loading &&
        (data.applications.length === 0 ? (
          <p>還沒有投遞紀錄。</p>
        ) : (
          <ul aria-label="投遞紀錄">
            {data.applications.map((application) => (
              <ApplicationRow
                key={application.id}
                application={application}
                versions={data.versions}
                onUpdate={data.update}
                onDelete={data.remove}
              />
            ))}
          </ul>
        ))
      )}
    </section>
  );
}

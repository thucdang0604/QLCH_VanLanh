const fs = require('fs');

const file = 'm:/QLCH_VanLanh/src/app/admin/articles/page.tsx';
let txt = fs.readFileSync(file, 'utf8');

// 1. Remove suggest button
txt = txt.replace(/<button[\s\n]*type="button"[\s\n]*onClick=\{\(\) => handleSeoMagic\('suggest'\)\}.*?<\/button>/s, '');
txt = txt.replace(/\{isCheckingSeo && seoResult\.type === 'check' \?/g, '{isCheckingSeo ?');

// 2. Banner
const banner = `<div className="p-4 md:p-6 space-y-5 overflow-y-auto flex-1 pb-20 md:pb-6">
                    {/* --- AUTO PILOT BANNER --- */}
                    <div className="bg-gradient-to-r from-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl p-5 shadow-sm transform transition-all hover:shadow-md mb-4 animate-in fade-in zoom-in-95">
                        <h3 className="font-bold mb-2 flex items-center gap-2 text-lg">
                            <span className="bg-indigo-600 text-white p-1 rounded-md"><Wand2 size={18} /></span>
                            Auto-Pilot 1-Touch: Đăng Bài Tự Động
                        </h3>
                        <p className="text-sm text-indigo-700 mb-4 opacity-90 leading-relaxed max-w-xl">
                            Hệ thống sẽ tự động sinh Meta chuẩn SEO, Content chuyên sâu EEAT và ghép Hình Ảnh / Video vào bài viết. Tất cả chỉ trong 1 quy trình.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input 
                                type="text"
                                placeholder="Nhập từ khóa chính hoặc ý tưởng bài viết (vd: Tủ lạnh giá rẻ)..."
                                value={autoPilotTopic}
                                onChange={(e) => setAutoPilotTopic(e.target.value)}
                                disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                className="flex-1 h-11 px-4 border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-indigo-300"
                            />
                            <button
                                type="button"
                                onClick={runAutoPilot}
                                disabled={autoPilotState !== 'idle' && autoPilotState !== 'done'}
                                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
                            >
                                {autoPilotState !== 'idle' && autoPilotState !== 'done' ? (
                                    <><Loader2 size={18} className="animate-spin" /> Hệ thống đang chạy...</>
                                ) : (
                                    <><Wand2 size={18} /> Khởi động Auto-Pilot</>
                                )}
                            </button>
                        </div>

                        {autoPilotLogs.length > 0 && (
                            <div className="mt-4 bg-indigo-950/90 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-indigo-200 space-y-1.5 shadow-inner">
                                {autoPilotLogs.map((log, idx) => (
                                    <div key={idx} className="animate-in fade-in slide-in-from-left-2 flex items-start gap-2">
                                        <span className="text-indigo-500">{'>'}</span> {log}
                                    </div>
                                ))}
                                {autoPilotState !== 'idle' && autoPilotState !== 'done' && (
                                    <div className="flex items-center gap-2 text-indigo-400 ml-1 mt-2">
                                        <Loader2 size={10} className="animate-spin" /> ...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>`;

txt = txt.replace('<div className="p-4 md:p-6 space-y-5 overflow-y-auto flex-1 pb-20 md:pb-6">', banner);

// 3. remove suggest title block
txt = txt.replace(/\{seoResult\.type === 'suggest' && \(suggestedTitle \|\| isCheckingSeo\).*?\<\/div\>\n                        \)\}/s, '');

// 4. remove suggest excerpt
txt = txt.replace(/\{seoResult\.type === 'suggest' && \(suggestedDesc \|\| isCheckingSeo\).*?\<\/div\>\n                        \)\}/s, '');

// 5. remove suggest tags
txt = txt.replace(/\{seoResult\.type === 'suggest' && \(suggestedTags \|\| isCheckingSeo\).*?\<\/div\>\n                        \)\}/s, '');

// 6. remove content ai buttons
txt = txt.replace(/<div className="flex gap-2">[\s\n]*<button[\s\n]*type="button"[\s\n]*onClick=\{\(\) => setShowImageGen.*?: <Wand2 size=\{14\} \/>\}[\s\n]*<span.*?<\/button>[\s\n]*<\/div>/s, '');


// 7. remove suggest content block
txt = txt.replace(/\{seoResult\.type === 'content'.*?__html: seoResult\.content \}\}[\s\n]*\/>[\s\n]*<\/div>[\s\n]*\)\}/s, '');


// 8. Replace image gen panel
const imgPanelStart = txt.indexOf('{/* AI Image Generation Panel */}');
const footersStart = txt.indexOf('{/* Actions */}', imgPanelStart);

if (imgPanelStart !== -1 && footersStart !== -1) {
    const videoLinkHtml = `{/* Placeholder Helpers (Video & Links) */}
                        {(() => {
                            const vidPhs = getVideoPlaceholders();
                            const linkPhs = getLinkPlaceholders();
                            
                            if (vidPhs.length === 0 && linkPhs.length === 0) {
                                return null;
                            }

                            return (
                                <div className="mt-4 border rounded-xl p-5 bg-gradient-to-br from-slate-50 to-emerald-50 border-emerald-200 animate-in fade-in zoom-in-95 shadow-sm">
                                    <h3 className="font-bold flex items-center gap-2 text-slate-800 text-sm mb-4">
                                        <Wand2 size={16} className="text-emerald-500" /> Quản lý Video & Liên Kết chờ duyệt
                                    </h3>
                                    <div className="space-y-4">
                                        {/* Videos */}
                                        {vidPhs.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                                                    <Video size={12} /> Vị trí Video do AI đề xuất ({vidPhs.length}):
                                                </p>
                                                <div className="space-y-2">
                                                    {vidPhs.map((ph, i) => (
                                                        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 hover:border-blue-300 transition-all shadow-sm">
                                                            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0">V</span>
                                                            <span className="flex-1 text-xs text-blue-900 leading-relaxed font-medium">{ph.description}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleInsertVideoPlaceholder(ph.description)}
                                                                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center justify-center gap-1.5 w-full sm:w-auto"
                                                            >
                                                                <Video size={14} /> Chèn Nhanh
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Links */}
                                        {linkPhs.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                                                    <LinkIcon size={12} /> Đề xuất Liên kết nội bộ ({linkPhs.length}):
                                                </p>
                                                <div className="space-y-2">
                                                    {linkPhs.map((ph, i) => (
                                                        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-emerald-200 bg-white p-3 hover:border-emerald-300 transition-all shadow-sm">
                                                            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">L</span>
                                                            <span className="flex-1 text-xs text-emerald-900 leading-relaxed font-medium">{ph.description}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleInsertLinkPlaceholder(ph.description)}
                                                                className="shrink-0 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center justify-center gap-1.5 w-full sm:w-auto"
                                                            >
                                                                <LinkIcon size={14} /> Chèn Link
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    
                    `;
    // We replace from imgPanelStart to the end of the </div> that wraps the Quill editor content
    // wait footersStart is `{/* Actions */}`
    // Let's replace perfectly:
    txt = txt.substring(0, imgPanelStart) + videoLinkHtml + txt.substring(footersStart);
}

fs.writeFileSync(file, txt);
console.log("Done");

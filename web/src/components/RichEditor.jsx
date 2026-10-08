import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import Icon from './Icon.jsx';

const FONTS = [
	{ label: 'Default font', value: '' },
	{ label: 'Arial', value: 'Arial, sans-serif' },
	{ label: 'Georgia', value: 'Georgia, serif' },
	{ label: 'Verdana', value: 'Verdana, sans-serif' },
	{ label: 'Courier New', value: "'Courier New', monospace" },
];

const SIZES = [
	{ label: 'Size', value: '' },
	{ label: 'Small', value: '12px' },
	{ label: 'Normal', value: '15px' },
	{ label: 'Large', value: '18px' },
	{ label: 'X-Large', value: '24px' },
	{ label: 'Huge', value: '32px' },
];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function Btn({ title, active, disabled, onClick, children }) {
	return (
		<button type="button" className={`hub-rte-btn ${active ? 'active' : ''}`} title={title} aria-label={title} aria-pressed={!!active}
			disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
			{children}
		</button>
	);
}

/**
 * WYSIWYG editor for Message Board messages (TipTap). Emits HTML; the server sanitises it again on save.
 * `onUpload(file)` must resolve to { url } or { error }.
 */
export default function RichEditor({ value, onChange, onUpload, disabled = false, placeholder }) {
	const fileRef = useRef(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState('');
	const uploadRef = useRef(null);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
			}),
			TextStyle,
			Color,
			FontFamily,
			FontSize,
			Highlight.configure({ multicolor: true }),
			TextAlign.configure({ types: ['heading', 'paragraph'] }),
			Image.configure({ allowBase64: false }),
			Youtube.configure({ nocookie: true, width: 640, height: 360 }),
			Placeholder.configure({ placeholder: placeholder || 'Write the message…' }),
		],
		content: value || '',
		editable: !disabled,
		shouldRerenderOnTransaction: true,
		onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
		editorProps: {
			attributes: { class: 'hub-rte-content hub-board-body', 'aria-label': 'Message body' },
			handlePaste: (view, event) => uploadRef.current?.(event.clipboardData?.files) || false,
			handleDrop: (view, event) => uploadRef.current?.(event.dataTransfer?.files) || false,
		},
	});

	useEffect(() => {
		if (!editor) return;
		const current = editor.isEmpty ? '' : editor.getHTML();
		if ((value || '') !== current) editor.commands.setContent(value || '', { emitUpdate: false });
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	async function insertImages(files) {
		setError('');
		setUploading(true);
		for (const file of files) {
			// eslint-disable-next-line no-await-in-loop
			const r = await onUpload(file);
			if (r?.url) editor.chain().focus().setImage({ src: r.url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
			else setError(r?.error || 'Image upload failed.');
		}
		setUploading(false);
	}

	/** Pasted or dropped image files are uploaded instead of being embedded as base64. */
	uploadRef.current = (list) => {
		const files = [...(list || [])].filter((f) => IMAGE_TYPES.includes(f.type));
		if (!files.length || disabled) return false;
		insertImages(files);
		return true;
	};

	if (!editor) return null;

	const chain = () => editor.chain().focus();
	const textStyle = editor.getAttributes('textStyle');

	function setLink() {
		const prev = editor.getAttributes('link').href || '';
		const url = window.prompt('Link address (leave empty to remove the link)', prev || 'https://');
		if (url === null) return;
		if (!url.trim() || url.trim() === 'https://') chain().extendMarkRange('link').unsetLink().run();
		else chain().extendMarkRange('link').setLink({ href: url.trim() }).run();
	}

	function addVideo() {
		const url = window.prompt('YouTube or Vimeo address (e.g. https://www.youtube.com/watch?v=…)');
		if (!url) return;
		if (/vimeo\.com\/(\d+)/.test(url)) {
			const id = url.match(/vimeo\.com\/(\d+)/)[1];
			chain().insertContent(`<p><a href="https://vimeo.com/${id}">Watch the video on Vimeo</a></p>`).run();
			return;
		}
		if (!editor.commands.setYoutubeVideo({ src: url.trim() })) setError('That does not look like a YouTube link.');
	}

	return (
		<div className={`hub-rte ${disabled ? 'is-disabled' : ''}`}>
			{!disabled && (
				<div className="hub-rte-toolbar" role="toolbar" aria-label="Formatting">
					<div className="hub-rte-group">
						<Btn title="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Icon name="undo" size={16} /></Btn>
						<Btn title="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Icon name="redo" size={16} /></Btn>
					</div>
					<div className="hub-rte-group">
						<select className="hub-rte-select" aria-label="Paragraph style"
							value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
							onChange={(e) => {
								const v = e.target.value;
								if (v === 'p') chain().setParagraph().run();
								else chain().setHeading({ level: Number(v.slice(1)) }).run();
							}}>
							<option value="p">Paragraph</option>
							<option value="h1">Heading 1</option>
							<option value="h2">Heading 2</option>
							<option value="h3">Heading 3</option>
						</select>
						<select className="hub-rte-select" aria-label="Font" value={textStyle.fontFamily || ''}
							onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}>
							{FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
						</select>
						<select className="hub-rte-select" aria-label="Font size" value={textStyle.fontSize || ''}
							onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}>
							{SIZES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
						</select>
					</div>
					<div className="hub-rte-group">
						<Btn title="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><strong>B</strong></Btn>
						<Btn title="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><em>I</em></Btn>
						<Btn title="Underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
						<Btn title="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
						<label className="hub-rte-color" title="Text colour">
							<span style={{ borderBottomColor: textStyle.color || '#1f2d38' }}>A</span>
							<input type="color" value={textStyle.color || '#1f2d38'} aria-label="Text colour"
								onChange={(e) => chain().setColor(e.target.value).run()} />
						</label>
						<label className="hub-rte-color hub-rte-highlight" title="Highlight">
							<span style={{ background: editor.getAttributes('highlight').color || '#fff3a3' }}>H</span>
							<input type="color" value={editor.getAttributes('highlight').color || '#fff3a3'} aria-label="Highlight colour"
								onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()} />
						</label>
					</div>
					<div className="hub-rte-group">
						<Btn title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()}><Icon name="alignLeft" size={16} /></Btn>
						<Btn title="Align centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()}><Icon name="alignCenter" size={16} /></Btn>
						<Btn title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()}><Icon name="alignRight" size={16} /></Btn>
					</div>
					<div className="hub-rte-group">
						<Btn title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}><Icon name="list" size={16} /></Btn>
						<Btn title="Numbered list (steps)" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}><Icon name="listOl" size={16} /></Btn>
						<Btn title="Quote / tip box" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}><Icon name="quote" size={15} /></Btn>
						<Btn title="Divider line" onClick={() => chain().setHorizontalRule().run()}><Icon name="minus" size={16} /></Btn>
					</div>
					<div className="hub-rte-group">
						<Btn title="Link" active={editor.isActive('link')} onClick={setLink}><Icon name="link" size={16} /></Btn>
						<Btn title="Insert image (or paste / drop one)" disabled={uploading} onClick={() => fileRef.current?.click()}>
							{uploading ? <span className="spinner-border spinner-border-sm" /> : <Icon name="image" size={16} />}
						</Btn>
						<Btn title="Embed a YouTube video" onClick={addVideo}><Icon name="video" size={16} /></Btn>
						<Btn title="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}><Icon name="eraser" size={16} /></Btn>
					</div>
					<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="d-none" multiple
						onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) insertImages(files); }} />
				</div>
			)}
			{error && <div className="hub-rte-error">{error} <button type="button" className="close" onClick={() => setError('')}>&times;</button></div>}
			<EditorContent editor={editor} />
		</div>
	);
}

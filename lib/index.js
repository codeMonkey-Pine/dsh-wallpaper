import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/engine/library.ts
/**
* Wallpaper Engine library scanner: discovers the Steam libraries and the
* Wallpaper Engine install, scans the workshop content folder (431960) plus
* the local projects folder, parses each wallpaper's project.json (falling
* back to extension sniffing), and resolves raw asset paths for the file
* route. Rendering fidelity notes: video wallpapers play the original webm,
* web wallpapers load their own index.html through the raw route, image
* wallpapers use the original image, and scene wallpapers degrade to their
* preview image (the full scene renderer is not portable to a page).
* @module dsh-wallpaper/engine/library
*/
/** Candidate steam roots, in discovery order (later entries win the last-write). */
function steamCandidates(configured) {
	const candidates = [];
	const push = (value) => {
		if (value !== void 0 && value !== "" && !candidates.includes(value)) candidates.push(value);
	};
	push(configured.steamDir);
	push(process.env.STEAM_ROOT);
	push(process.env.DSH_WALLPAPER_STEAM);
	const programFiles = process.env["ProgramFiles(x86)"] ?? process.env.ProgramFiles;
	push(programFiles !== void 0 ? join(programFiles, "Steam") : void 0);
	push(process.env.ProgramFiles !== void 0 ? join(process.env.ProgramFiles, "Steam") : void 0);
	push("C:\\Steam");
	push("D:\\Steam");
	push("E:\\Steam");
	push("C:\\SteamLibrary");
	push("D:\\SteamLibrary");
	return candidates;
}
/** Parse libraryfolders.vdf into the libraries it declares. */
function parseLibraryFolders(steamRoot) {
	const file = join(steamRoot, "steamapps", "libraryfolders.vdf");
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return [];
	}
	const libraries = [];
	const pattern = /"path"\s*"([^"]+)"/g;
	let match;
	while ((match = pattern.exec(text)) !== null) {
		const path = (match[1] ?? "").replace(/\\\\/g, "\\");
		if (path === "") continue;
		const workshop = join(path, "steamapps", "workshop", "content", "431960");
		libraries.push({
			path,
			workshop
		});
	}
	return libraries;
}
/** Discover every steam library and the Wallpaper Engine install. */
function discoverLibraries(configured) {
	const libraries = [];
	const seen = /* @__PURE__ */ new Set();
	const pushLibrary = (path) => {
		const normalized = resolve(path);
		const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
		if (seen.has(key)) return;
		seen.add(key);
		libraries.push({
			path: normalized,
			workshop: join(normalized, "steamapps", "workshop", "content", "431960")
		});
	};
	for (const root of steamCandidates(configured)) {
		if (!existsSync(root)) continue;
		const steamApps = join(root, "steamapps");
		if (existsSync(join(root, "steamapps", "libraryfolders.vdf"))) {
			pushLibrary(root);
			for (const library of parseLibraryFolders(root)) pushLibrary(library.path);
		} else if (existsSync(steamApps)) pushLibrary(root);
	}
	let engineDir;
	if (configured.engineDir !== void 0 && configured.engineDir !== "") {
		if (existsSync(configured.engineDir)) engineDir = resolve(configured.engineDir);
	}
	if (engineDir === void 0) {
		const commonCandidates = [];
		for (const library of libraries) commonCandidates.push(join(library.path, "steamapps", "common", "wallpaper_engine"));
		for (const candidate of commonCandidates) if (existsSync(candidate)) {
			engineDir = candidate;
			break;
		}
	}
	return {
		libraries,
		engineDir
	};
}
/** File extensions by wallpaper kind. */
const VIDEO_EXTENSIONS = [
	".webm",
	".mp4",
	".ogv",
	".mov"
];
const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".bmp"
];
const PREVIEW_NAMES = [
	"preview.jpg",
	"preview.png",
	"preview.webp",
	"preview.gif",
	"thumb.jpg",
	"thumb.png",
	"thumbnail.jpg",
	"scene.preview.png",
	"screenshot.jpg"
];
/** Map a project.json `type` value to the wallpaper kind. */
function typeFromProject(value) {
	if (typeof value === "number") {
		if (value === 0) return "scene";
		if (value === 1) return "video";
		if (value === 2) return "web";
		if (value === 3) return "image";
		return;
	}
	if (typeof value === "string") {
		const normalized = value.toLowerCase();
		if (normalized === "scene" || normalized === "scenes") return "scene";
		if (normalized === "video" || normalized === "videos") return "video";
		if (normalized === "web" || normalized === "website" || normalized === "html") return "web";
		if (normalized === "image" || normalized === "picture" || normalized === "img") return "image";
		return;
	}
}
/** First file in the folder matching one of the extensions. */
function findByExtension(folder, extensions) {
	let files;
	try {
		files = readdirSync(folder);
	} catch {
		return;
	}
	for (const file of files) if (extensions.includes(extensionOf(file))) return file;
}
/** Lowercased extension with the leading dot. */
function extensionOf(file) {
	const dot = file.lastIndexOf(".");
	return dot < 0 ? "" : file.slice(dot).toLowerCase();
}
/** The first existing preview candidate. */
function findPreview(folder, declared) {
	if (declared !== void 0 && declared !== "") {
		if (existsSync(resolve(folder, declared))) return declared;
	}
	for (const name of PREVIEW_NAMES) if (existsSync(join(folder, name))) return name;
	return "";
}
/** Number-ish helper for project.json properties. */
function numberValue(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
}
/** String helper for project.json fields. */
function stringValue(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** Scan one wallpaper folder; returns null when it holds nothing usable. */
function scanFolder(folder, source, id, current) {
	let project;
	try {
		const raw = readFileSync(join(folder, "project.json"), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) project = parsed;
	} catch {
		project = void 0;
	}
	const declaredType = project !== void 0 ? typeFromProject(project.type) : void 0;
	const declaredFile = project !== void 0 ? stringValue(project.file) : void 0;
	const declaredPreview = project !== void 0 ? stringValue(project.preview) ?? stringValue(project.general?.properties?.preview?.value) : void 0;
	let type = declaredType;
	let file = declaredFile;
	if (file !== void 0) {
		if (type === void 0) {
			const extension = extensionOf(file);
			if (extension === ".json" || file.toLowerCase() === "scene.json") type = "scene";
			else if (VIDEO_EXTENSIONS.includes(extension)) type = "video";
			else if (extension === ".html") type = "web";
			else if (IMAGE_EXTENSIONS.includes(extension)) type = "image";
		}
		if (file !== "scene.json" && !existsSync(join(folder, file))) file = void 0;
	}
	if (type === void 0 || file === void 0) {
		const hasScene = existsSync(join(folder, "scene.json"));
		const video = findByExtension(folder, VIDEO_EXTENSIONS);
		const html = findByExtension(folder, [".html"]);
		const image = findByExtension(folder, IMAGE_EXTENSIONS);
		if (type === void 0) {
			if (video !== void 0) type = "video";
			else if (html !== void 0) type = "web";
			else if (image !== void 0) type = "image";
			else if (hasScene) type = "scene";
		}
		if (file === void 0) {
			if (type === "video") file = video;
			else if (type === "web") file = html;
			else if (type === "image") file = image;
			else if (type === "scene") file = hasScene ? "scene.json" : void 0;
		}
	}
	if (type === void 0) return null;
	const workshopId = source === "workshop" ? basename(folder) : void 0;
	const preview = findPreview(folder, declaredPreview);
	const properties = project?.general?.properties;
	const tags = Array.isArray(project?.tags) ? project.tags.filter((tag) => typeof tag === "string") : [];
	return {
		id,
		title: stringValue(project?.title) ?? (source === "workshop" ? `Workshop ${workshopId ?? basename(folder)}` : basename(folder)),
		type,
		source,
		folder: resolve(folder),
		file: file ?? "",
		preview,
		width: numberValue(properties?.width?.value),
		height: numberValue(properties?.height?.value),
		fps: numberValue(properties?.fps?.value),
		workshopId,
		tags,
		description: stringValue(project?.description),
		current
	};
}
/** Extract the folder name of every wallpaper currently used by Wallpaper Engine. */
function currentWallpaperFolders(engineDir) {
	const result = /* @__PURE__ */ new Set();
	if (engineDir === void 0) return result;
	try {
		const raw = readFileSync(join(engineDir, "config", "config.json"), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return result;
		const list = parsed.wallpaperlist;
		if (!Array.isArray(list)) return result;
		for (const item of list) {
			if (typeof item !== "object" || item === null) continue;
			const directory = item.directory;
			if (typeof directory !== "string" || directory === "") continue;
			const segments = directory.replace(/\\/g, "/").split("/").filter((segment) => segment !== "");
			if (segments.length >= 2) {
				const kind = segments[segments.length - 2];
				const name = segments[segments.length - 1];
				if (kind === "steamworkshop" && /^\d+$/.test(name)) result.add(name);
				else if (kind === "projects") result.add(name);
				else result.add(name);
			} else if (segments.length === 1) result.add(segments[0] ?? "");
		}
	} catch {}
	return result;
}
/** Scan a directory of wallpaper folders. */
function scanDirectory(dir, source, currentFolders) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return [];
	}
	const result = [];
	for (const name of entries) {
		const entry = scanFolder(join(dir, name), source, source === "workshop" ? `ws-${name}` : `prj-${name}`, currentFolders.has(name));
		if (entry !== null) result.push(entry);
	}
	return result;
}
/** Wallpaper Engine library: discovery, scanning, and raw-path resolution. */
var WallpaperLibrary = class {
	configured;
	cached;
	scanning;
	constructor(configured) {
		this.configured = configured;
	}
	/** Re-read configured overrides (called after the state file changes). */
	setConfigured(configured) {
		this.configured.engineDir = configured.engineDir;
		this.configured.steamDir = configured.steamDir;
		this.cached = void 0;
	}
	/** The currently discovered engine/steam dirs (scan-independent). */
	dirs() {
		const { libraries, engineDir } = discoverLibraries(this.configured);
		return {
			engineDir,
			steamDir: libraries.length > 0 ? libraries[0]?.path : void 0
		};
	}
	/** Scan (or return the cached scan when one exists). */
	scan(force = false) {
		if (!force && this.cached !== void 0) return Promise.resolve(this.cached);
		this.scanning ??= this.doScan().finally(() => {
			this.scanning = void 0;
		});
		return this.scanning;
	}
	async doScan() {
		const { libraries, engineDir } = discoverLibraries(this.configured);
		const currentFolders = currentWallpaperFolders(engineDir);
		const libraryDirs = [];
		const wallpapers = [];
		const seenFolders = /* @__PURE__ */ new Set();
		for (const library of libraries) {
			if (!existsSync(library.workshop)) continue;
			libraryDirs.push(library.workshop);
			for (const entry of scanDirectory(library.workshop, "workshop", currentFolders)) {
				const key = process.platform === "win32" ? entry.folder.toLowerCase() : entry.folder;
				if (seenFolders.has(key)) continue;
				seenFolders.add(key);
				wallpapers.push(entry);
			}
		}
		if (engineDir !== void 0) {
			const projects = join(engineDir, "projects");
			if (existsSync(projects)) {
				libraryDirs.push(projects);
				for (const entry of scanDirectory(projects, "projects", currentFolders)) {
					const key = process.platform === "win32" ? entry.folder.toLowerCase() : entry.folder;
					if (seenFolders.has(key)) continue;
					seenFolders.add(key);
					wallpapers.push(entry);
				}
			}
		}
		wallpapers.sort((a, b) => {
			if (a.current !== b.current) return a.current ? -1 : 1;
			return a.title.localeCompare(b.title);
		});
		const snapshot = {
			engineDir,
			steamDir: libraries.length > 0 ? libraries[0]?.path : void 0,
			libraryDirs,
			wallpapers,
			scannedAt: Date.now()
		};
		this.cached = snapshot;
		return snapshot;
	}
	/** Resolve a wallpaper id to its folder; undefined when unknown. */
	folderOf(id) {
		const snapshot = this.cached;
		if (snapshot === void 0) return void 0;
		return snapshot.wallpapers.find((item) => item.id === id)?.folder;
	}
	/**
	* Resolve a raw asset request: id plus a relative path inside the wallpaper
	* folder. Returns the absolute path only when it stays inside the folder
	* (path-traversal guard). The caller re-scans when the cache is missing.
	*/
	resolveRaw(id, relativePath) {
		const folder = this.folderOf(id);
		if (folder === void 0) return void 0;
		const absolute = resolve(folder, relativePath);
		if (absolute !== folder && !absolute.startsWith(folder + sep)) return void 0;
		if (!existsSync(absolute)) return void 0;
		return absolute;
	}
};
//#endregion
//#region src/engine/state.ts
/**
* Host state persistence for dsh-wallpaper: reads and writes
* `~/.dsh/dsh-wallpaper.json` — the Wallpaper Engine path overrides
* (engineDir / steamDir) and the agent-set desired state that the browser
* half merges on boot. The browser's own settings live in localStorage; this
* file only carries what the host owns.
* @module dsh-wallpaper/engine/state
*/
/** State file location under the dsh home. */
function statePath() {
	return join(homedir(), ".dsh", "dsh-wallpaper.json");
}
/** Empty desired state. */
function emptyDesired() {
	return {};
}
/** Load the state file; absent or unparsable files fall back to empty state. */
function loadState() {
	try {
		const raw = readFileSync(statePath(), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return { desired: emptyDesired() };
		const state = parsed;
		return {
			engineDir: typeof state.engineDir === "string" ? state.engineDir : void 0,
			steamDir: typeof state.steamDir === "string" ? state.steamDir : void 0,
			desired: typeof state.desired === "object" && state.desired !== null ? state.desired : emptyDesired()
		};
	} catch {
		return { desired: emptyDesired() };
	}
}
/** Persist the state file; a write failure is logged and swallowed (never fatal). */
function saveState(state) {
	try {
		const file = statePath();
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
	} catch (error) {
		console.error(`[dsh-wallpaper] failed to save state: ${error instanceof Error ? error.message : String(error)}`);
	}
}
//#endregion
//#region src/protocol.ts
/**
* Shared wire protocol between the dsh-wallpaper host half and the browser
* half. Pure constants and types only — no Node or DOM imports, so the same
* file is safe to bundle into the client.
* @module dsh-wallpaper/protocol
*/
/** The /api/dsh-wallpaper route family. */
const API = {
	/** GET — engine/steam dirs and scan errors. */
	status: "/api/dsh-wallpaper/status",
	/** GET — library snapshot (?refresh=1 forces a rescan). */
	library: "/api/dsh-wallpaper/library",
	/** POST — force a rescan, returns the fresh library. */
	rescan: "/api/dsh-wallpaper/rescan",
	/** POST — set engineDir/steamDir overrides, persists to the host state file. */
	config: "/api/dsh-wallpaper/config",
	/** GET/POST — the agent-set desired state (id/opacity/scope). */
	state: "/api/dsh-wallpaper/state",
	/** GET — raw wallpaper file: /api/dsh-wallpaper/raw/<id>/<relative path>. */
	raw: "/api/dsh-wallpaper/raw"
};
//#endregion
//#region src/routes.ts
/**
* The /api/dsh-wallpaper route family: library status/list, rescan, path
* overrides, the agent-set desired state, and the raw wallpaper asset file
* server (with a loopback-only trust fence, a path-traversal guard, and Range
* support so <video> seeking works). Every route mirrors dsh-ssh's fence:
* LAN-exposed dsh web deployments must not serve local wallpaper files to
* strangers.
* @module dsh-wallpaper/routes
*/
/** Cap on JSON request bodies (path overrides and desired state are small). */
const MAX_JSON_BODY_BYTES = 64 * 1024;
/** MIME types for the wallpaper asset extensions WE ships. */
const MIME_BY_EXTENSION = {
	".webm": "video/webm",
	".mp4": "video/mp4",
	".ogv": "video/ogg",
	".mov": "video/quicktime",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".html": "text/html; charset=utf-8",
	".htm": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".wav": "audio/wav",
	".mpd": "application/dash+xml",
	".m3u8": "application/vnd.apple.mpegurl",
	".glb": "model/gltf-binary",
	".obj": "text/plain",
	".mtl": "text/plain"
};
/** Loopback literal check plus browser same-origin markers (mirrors dsh-ssh). */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** Read a JSON request body (undefined when too large or unparsable). */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** URL query helper (first value, decoded). */
function queryParam(url, name) {
	const value = url.searchParams.get(name);
	return value === null ? void 0 : value;
}
/** Validate a desired-state patch (unknown keys are ignored). */
function sanitizeDesiredPatch(body) {
	const patch = {};
	if (body === void 0) return patch;
	if (typeof body.id === "string" && body.id !== "" && /^[A-Za-z0-9._-]+$/.test(body.id)) patch.id = body.id;
	if (typeof body.opacity === "number" && Number.isFinite(body.opacity)) patch.opacity = Math.max(0, Math.min(100, Math.round(body.opacity)));
	if (body.scope === "page" || body.scope === "main") patch.scope = body.scope;
	return patch;
}
/**
* Build every /api/dsh-wallpaper route (exact paths plus the raw prefix).
* @param deps - library scanner and host state access.
* @returns the route list for ctx.webServer.register.
*/
function makeRoutes(deps) {
	const { library } = deps;
	/** Fence + method guard. */
	const guard = (req, res, method) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, { error: `method not allowed: ${req.method}` });
			return false;
		}
		return true;
	};
	/** One snapshot response with the current dirs. */
	const snapshotJson = async (res, force) => {
		writeJson(res, 200, await library.scan(force));
	};
	return [
		{
			kind: "exact",
			path: API.status,
			handler: async (req, res) => {
				if (!guard(req, res, "GET")) return;
				const snapshot = await library.scan(false);
				writeJson(res, 200, {
					engineDir: snapshot.engineDir,
					steamDir: snapshot.steamDir,
					libraryDirs: snapshot.libraryDirs,
					scanError: snapshot.scanError,
					scannedAt: snapshot.scannedAt,
					wallpaperCount: snapshot.wallpapers.length
				});
			}
		},
		{
			kind: "exact",
			path: API.library,
			handler: async (req, res) => {
				if (!guard(req, res, "GET")) return;
				await snapshotJson(res, queryParam(new URL(req.url ?? "/", "http://localhost"), "refresh") === "1");
			}
		},
		{
			kind: "exact",
			path: API.rescan,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				await snapshotJson(res, true);
			}
		},
		{
			kind: "exact",
			path: API.config,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "invalid JSON body" });
					return;
				}
				const next = { ...deps.getState() };
				if (typeof body.engineDir === "string") next.engineDir = body.engineDir;
				if (typeof body.steamDir === "string") next.steamDir = body.steamDir;
				deps.saveState(next);
				library.setConfigured({
					engineDir: next.engineDir,
					steamDir: next.steamDir
				});
				await snapshotJson(res, true);
			}
		},
		{
			kind: "exact",
			path: API.state,
			handler: async (req, res) => {
				const method = req.method ?? "GET";
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				if (method === "GET") {
					writeJson(res, 200, { desired: deps.getState().desired });
					return;
				}
				if (method !== "POST") {
					writeJson(res, 405, { error: `method not allowed: ${method}` });
					return;
				}
				const body = await readJsonBody(req);
				const state = deps.getState();
				const desired = {
					...state.desired,
					...sanitizeDesiredPatch(body)
				};
				deps.saveState({
					...state,
					desired
				});
				writeJson(res, 200, { desired });
			}
		},
		{
			kind: "prefix",
			path: API.raw,
			handler: async (req, res) => {
				if (!guard(req, res, "GET")) return;
				const segments = new URL(req.url ?? "/", "http://localhost").pathname.slice(API.raw.length).split("/").filter((segment) => segment !== "").map((segment) => safeDecode(segment));
				if (segments.length < 2 || segments[0] === void 0) {
					writeJson(res, 400, { error: "expected /api/dsh-wallpaper/raw/<id>/<path>" });
					return;
				}
				const id = segments[0];
				const relative = segments.slice(1).join("/");
				if (relative === "" || relative.includes("..") || relative.startsWith("/")) {
					writeJson(res, 400, { error: "invalid asset path" });
					return;
				}
				if (!(await library.scan(false)).wallpapers.some((entry) => entry.id === id)) {
					writeJson(res, 404, { error: `wallpaper '${id}' not found` });
					return;
				}
				const absolute = library.resolveRaw(id, relative);
				if (absolute === void 0) {
					writeJson(res, 404, { error: `asset '${relative}' not found` });
					return;
				}
				serveFile(req, res, absolute, relative);
			}
		}
	];
}
/** URL-decode one path segment, tolerating malformed escapes. */
function safeDecode(segment) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}
/** Content type for one asset path. */
function contentTypeOf(path) {
	return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
}
/** Whether an asset should be cached aggressively (media) or revalidated (html). */
function cacheControlOf(path) {
	const extension = extname(path).toLowerCase();
	if (extension === ".html" || extension === ".htm" || extension === ".json") return "no-cache";
	return "private, max-age=60";
}
/** Serve one file with Range support (video seeking). */
function serveFile(req, res, absolute, displayPath) {
	let size;
	try {
		size = statSync(absolute).size;
	} catch {
		writeJson(res, 404, { error: `asset '${displayPath}' not found` });
		return;
	}
	const contentType = contentTypeOf(absolute);
	const cacheControl = cacheControlOf(absolute);
	const range = req.headers.range;
	if (range === void 0) {
		res.writeHead(200, {
			"content-type": contentType,
			"content-length": String(size),
			"accept-ranges": "bytes",
			"cache-control": cacheControl,
			"referrer-policy": "no-referrer"
		});
		const stream = createReadStream(absolute);
		stream.on("error", () => {
			try {
				res.destroy();
			} catch {}
		});
		res.on("close", () => {
			if (!res.writableEnded) stream.destroy();
		});
		stream.pipe(res);
		return;
	}
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	if (match === null) {
		res.writeHead(416, { "content-range": `bytes */${String(size)}` });
		res.end();
		return;
	}
	let start;
	let end;
	if ((match[1] === "" || match[1] === void 0) && match[2] !== "" && match[2] !== void 0) {
		const suffix = Number(match[2]);
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = match[1] === "" || match[1] === void 0 ? 0 : Number(match[1]);
		end = match[2] === "" || match[2] === void 0 ? size - 1 : Number(match[2]);
	}
	if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
		res.writeHead(416, { "content-range": `bytes */${String(size)}` });
		res.end();
		return;
	}
	res.writeHead(206, {
		"content-type": contentType,
		"content-length": String(end - start + 1),
		"content-range": `bytes ${start}-${end}/${String(size)}`,
		"accept-ranges": "bytes",
		"cache-control": cacheControl,
		"referrer-policy": "no-referrer"
	});
	const stream = createReadStream(absolute, {
		start,
		end
	});
	stream.on("error", () => {
		try {
			res.destroy();
		} catch {}
	});
	res.on("close", () => {
		if (!res.writableEnded) stream.destroy();
	});
	stream.pipe(res);
}
//#endregion
//#region src/tools.ts
/**
* Agent tools for dsh-wallpaper: the DSH-native counterpart of the panel UI.
* wallpaper_scan rescans the Wallpaper Engine library, wallpaper_list lists
* the scanned wallpapers, wallpaper_set applies a wallpaper (or opacity/scope)
* through the host desired state that the browser half merges on boot, and
* wallpaper_config points the scanner at a non-default Steam / Wallpaper
* Engine install.
* @module dsh-wallpaper/tools
*/
/** One text content block (the only render shape these tools emit). */
function text(value) {
	return [{
		type: "text",
		text: value
	}];
}
/** Compact wallpaper table render. */
function renderWallpapers(snapshot) {
	if (snapshot.wallpapers.length === 0) return `no wallpapers found\nscanned directories:\n${snapshot.libraryDirs.length > 0 ? snapshot.libraryDirs.join("\n") : "none discovered"}\nengineDir: ${snapshot.engineDir ?? "not found"}\nsteamDir: ${snapshot.steamDir ?? "not found"}`;
	return [
		"id | title | type | source | current | size",
		"--- | --- | --- | --- | --- | ---",
		...snapshot.wallpapers.map((entry) => [
			entry.id,
			entry.title,
			entry.type,
			entry.source,
			entry.current ? "current" : "-",
			`${entry.width ?? "?"}x${entry.height ?? "?"}`
		].join(" | "))
	].join("\n");
}
/** Summarize one scan. */
function renderScanSummary(snapshot) {
	const lines = [
		`scanned ${snapshot.wallpapers.length} wallpaper(s)`,
		`engineDir: ${snapshot.engineDir ?? "not found"}`,
		`steamDir: ${snapshot.steamDir ?? "not found"}`
	];
	if (snapshot.libraryDirs.length > 0) lines.push(`directories:\n${snapshot.libraryDirs.join("\n")}`);
	if (snapshot.scanError !== void 0) lines.push(`scanError: ${snapshot.scanError}`);
	return lines.join("\n");
}
/** The wallpaper-scan tool. */
function wallpaperScanTool(deps) {
	return defineTool({
		name: "wallpaper_scan",
		description: "Rescan the local Wallpaper Engine library (Steam workshop 431960 + local projects) and report the discovered wallpaper count and paths. Triggers: wallpaper, wallpaper engine, scan wallpapers, 壁纸, 扫描壁纸.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					count: {
						type: "integer",
						required: true
					},
					engineDir: { type: "string" },
					steamDir: { type: "string" },
					directories: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					scanError: { type: "string" },
					summary: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => text(value.summary ?? "scan complete")
		},
		async execute() {
			const snapshot = await deps.library.scan(true);
			return {
				count: snapshot.wallpapers.length,
				engineDir: snapshot.engineDir,
				steamDir: snapshot.steamDir,
				directories: snapshot.libraryDirs,
				scanError: snapshot.scanError,
				summary: renderScanSummary(snapshot)
			};
		}
	});
}
/** The wallpaper-list tool. */
function wallpaperListTool(deps) {
	return defineTool({
		name: "wallpaper_list",
		description: "List the wallpapers in the local Wallpaper Engine library (id, title, type, source, current, size). Use wallpaper_set <id> to apply one to the web GUI background. Triggers: 壁纸列表, list wallpapers.",
		parameters: { query: {
			type: "string",
			description: "Optional case-insensitive filter against title, id, and tags."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					entries: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								type: {
									type: "string",
									enum: [
										"scene",
										"video",
										"web",
										"image"
									],
									required: true
								},
								source: {
									type: "string",
									enum: ["workshop", "projects"],
									required: true
								},
								current: {
									type: "boolean",
									required: true
								},
								width: { type: "integer" },
								height: { type: "integer" },
								preview: {
									type: "string",
									required: true
								}
							}
						}
					},
					summary: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => text(value.summary ?? "")
		},
		async execute(args) {
			const snapshot = await deps.library.scan(false);
			const query = (args.query ?? "").trim().toLowerCase();
			const entries = query === "" ? snapshot.wallpapers : snapshot.wallpapers.filter((entry) => entry.title.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query) || entry.tags.some((tag) => tag.toLowerCase().includes(query)));
			return {
				entries: entries.map((entry) => ({
					id: entry.id,
					title: entry.title,
					type: entry.type,
					source: entry.source,
					current: entry.current,
					width: entry.width,
					height: entry.height,
					preview: entry.preview
				})),
				summary: renderWallpapers({
					...snapshot,
					wallpapers: entries
				})
			};
		}
	});
}
/** The wallpaper-set tool (agent channel into the GUI). */
function wallpaperSetTool(deps) {
	return defineTool({
		name: "wallpaper_set",
		description: "Apply a wallpaper to the dsh web GUI background through the host desired state: set the active wallpaper id, opacity (0-100), and/or scope (page = whole page, main = center content column). The browser applies the desired state on load; the user can override it from the 壁纸设计 panel. Triggers: 设置壁纸, apply wallpaper, change wallpaper.",
		parameters: {
			id: {
				type: "string",
				description: "Wallpaper id from wallpaper_list (ws-<id> or prj-<name>)."
			},
			opacity: {
				type: "integer",
				description: "Wallpaper opacity 0-100."
			},
			scope: {
				type: "string",
				enum: ["page", "main"],
				description: "page = whole page, main = center content column only."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					desired: {
						type: "object",
						additionalProperties: false,
						properties: {
							id: { type: "string" },
							opacity: { type: "integer" },
							scope: {
								type: "string",
								enum: ["page", "main"]
							}
						}
					},
					error: { type: "string" }
				}
			},
			render: (_args, value) => {
				if (!value.ok) return text(`wallpaper_set failed: ${value.error ?? "unknown error"}`);
				const desired = value.desired ?? {};
				const parts = ["applied desired state:"];
				if (desired.id !== void 0) parts.push(`id: ${desired.id}`);
				if (desired.opacity !== void 0) parts.push(`opacity: ${desired.opacity}`);
				if (desired.scope !== void 0) parts.push(`scope: ${desired.scope}`);
				parts.push("(the web GUI picks this up on its next boot or refresh)");
				return text(parts.join("\n"));
			}
		},
		async execute(args) {
			const state = deps.getState();
			const desired = { ...state.desired };
			if (args.id !== void 0) {
				if (!(await deps.library.scan(false)).wallpapers.some((entry) => entry.id === args.id)) return {
					ok: false,
					desired,
					error: `wallpaper '${args.id}' not in the library (run wallpaper_scan first)`
				};
				desired.id = args.id;
			}
			if (args.opacity !== void 0) desired.opacity = Math.max(0, Math.min(100, Math.round(args.opacity)));
			if (args.scope === "page" || args.scope === "main") desired.scope = args.scope;
			deps.saveState({
				...state,
				desired
			});
			return {
				ok: true,
				desired
			};
		}
	});
}
/** The wallpaper-config tool (path overrides). */
function wallpaperConfigTool(deps) {
	return defineTool({
		name: "wallpaper_config",
		description: "Point the Wallpaper Engine scanner at a non-default Steam root or Wallpaper Engine install directory. The override persists to the host state file and takes effect immediately. Triggers: wallpaper path, 壁纸目录, configure wallpaper engine.",
		parameters: {
			engineDir: {
				type: "string",
				description: "Wallpaper Engine install directory (contains projects/ and config/)."
			},
			steamDir: {
				type: "string",
				description: "Steam root directory (contains steamapps/libraryfolders.vdf)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					engineDir: { type: "string" },
					steamDir: { type: "string" },
					count: { type: "integer" },
					error: { type: "string" }
				}
			},
			render: (_args, value) => {
				if (!value.ok) return text(`wallpaper_config failed: ${value.error ?? "unknown error"}`);
				return text(`scanner configured (${value.count ?? 0} wallpapers)\nengineDir: ${value.engineDir ?? "-"}\nsteamDir: ${value.steamDir ?? "-"}`);
			}
		},
		async execute(args) {
			const state = deps.getState();
			const next = { ...state };
			if (typeof args.engineDir === "string" && args.engineDir !== "") next.engineDir = args.engineDir;
			if (typeof args.steamDir === "string" && args.steamDir !== "") next.steamDir = args.steamDir;
			if (next.engineDir === state.engineDir && next.steamDir === state.steamDir) return {
				ok: false,
				error: "nothing to change (pass engineDir and/or steamDir)"
			};
			deps.saveState(next);
			deps.library.setConfigured({
				engineDir: next.engineDir,
				steamDir: next.steamDir
			});
			const snapshot = await deps.library.scan(true);
			return {
				ok: true,
				engineDir: snapshot.engineDir,
				steamDir: snapshot.steamDir,
				count: snapshot.wallpapers.length
			};
		}
	});
}
//#endregion
//#region src/index.ts
/** Stable cordis plugin name. */
const name = "wallpaper";
/** Services required before the wallpaper surfaces can mount. */
const inject = [
	"webServer",
	"tools",
	"systemPrompt"
];
/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_ANNOUNCE = true;
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const WALLPAPER_GUIDANCE = "本机已安装 dsh-wallpaper 插件（Wallpaper Engine 壁纸联动）：扫描本地 Wallpaper Engine 壁纸库（Steam 创意工坊 431960 + 本地 projects），把下载的壁纸设为 DSH Web GUI 的页面背景（图片 / 视频 / 网页壁纸按原样渲染，场景壁纸降级为预览图）。能力：wallpaper_scan 重新扫描壁纸库；wallpaper_list 列出壁纸（id / 标题 / 类型 / 来源 / 当前壁纸 / 分辨率）；wallpaper_set 把某张壁纸设为 GUI 背景（id / 不透明度 0-100 / 作用范围 page=整页 main=主内容区），浏览器下次加载时应用，用户可在「壁纸设计」面板覆盖；wallpaper_config 指定非默认的 Steam 根目录或 Wallpaper Engine 安装目录（覆盖持久化到 ~/.dsh/dsh-wallpaper.json）。GUI 侧「壁纸设计」面板支持不透明度、作用范围、填充模式、高斯模糊、暗角遮罩、帧率限制、失焦暂停、鼠标视差、点击穿透、多壁纸轮播与主题联动。限制：壁纸只作用于本机 GUI 页面（loopback-only），不改变 Windows 桌面壁纸；场景壁纸的粒子/特效渲染无法移植到网页，降级为预览图；视频壁纸直接播放原文件。用户提到「壁纸 / wallpaper / 壁纸设计」时即指本插件，请据此协作。";
/**
* Mount the scanner, routes, tools, and announcement.
* @param ctx - host plugin context carrying webServer/tools/systemPrompt.
* @param config - resolved plugin config (schema defaults applied by the loader).
*/
function apply(ctx, config) {
	const state = loadState();
	const library = new WallpaperLibrary({
		engineDir: state.engineDir,
		steamDir: state.steamDir
	});
	const resolve = () => ({
		announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
		enabled: config?.enabled ?? true
	});
	const routes = makeRoutes({
		library,
		getState: () => loadState(),
		saveState
	});
	const tools = [
		wallpaperScanTool({
			library,
			getState: () => loadState(),
			saveState
		}),
		wallpaperListTool({
			library,
			getState: () => loadState(),
			saveState
		}),
		wallpaperSetTool({
			library,
			getState: () => loadState(),
			saveState
		}),
		wallpaperConfigTool({
			library,
			getState: () => loadState(),
			saveState
		})
	];
	let disposeSection;
	let disposeRoutes;
	let disposeTools;
	const sync = () => {
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		if (disposeTools !== void 0) {
			disposeTools();
			disposeTools = void 0;
		}
		const value = resolve();
		if (!value.enabled) return;
		if (value.announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:dsh-wallpaper",
			order: SECTION_ORDER,
			text: WALLPAPER_GUIDANCE
		});
		disposeRoutes = ctx.effect(() => {
			const disposers = routes.map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-wallpaper: routes");
		disposeTools = ctx.effect(() => {
			const disposers = tools.map((tool) => ctx.tools.register(tool));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-wallpaper: tools");
	};
	sync();
}
//#endregion
export { WALLPAPER_GUIDANCE, apply, inject, name };

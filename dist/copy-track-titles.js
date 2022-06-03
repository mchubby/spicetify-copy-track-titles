//@ts-check
// NAME: CopyTrackTitles
// AUTHOR: mchubby
// VERSION: 1.0
// DESCRIPTION: Context menu item for copying to clipboard. Supports multiple tracks selection.

/// <reference path="../../spicetify-cli/globals.d.ts" />
(function CopyTrackTitles() {
    const { CosmosAsync, LocalStorage, Platform, URI } = Spicetify;
    if (!(CosmosAsync && LocalStorage && Platform && URI)) {
        setTimeout(CopyTrackTitles, 100);
        return;
    }

    const CACHE = new Map();
    // Persistent settings
    const LOCALSTORAGE_KEY = "CopyTrackTitles:track-format";
    const userConfigs = {
		trackFormat: LocalStorage.get(LOCALSTORAGE_KEY) || "%ARTISTS% - %TITLE%",
	};
    // UI Text
    const TOPBAR_TOOLTIP_TEXT = "CopyTrackTitles Settings";
    const CONTEXT_MENUITEM_TEXT = "CopyTrackTitles";

    class CTTPane {
        constructor() {
			this.container = document.createElement("div");
			this.container.id = "CTT-settings";
			this.container.className = "CTT-pane-container";

			const style = document.createElement("style");
				style.textContent = `
.CTT-pane-container {
    position: absolute;
    left: 0;
    right: 0;
    min-width: 30vw;
    max-width: 60vw;
    max-height: 90vh;
    z-index: 5000;
}

.CTT-pane-container dialog {
  color: #dbdbdb;
  background: #202b38;
  text-rendering: optimizeLegibility;
  width: 100%;
  margin: 0;
}

.CTT-pane-container input {
  transition: background-color 0.1s linear, border-color 0.1s linear, color 0.1s linear, box-shadow 0.1s linear, transform 0.1s ease;
  width: 100%;
  color: #fff;
  background-color: #161f27;
  font-family: inherit;
  font-size: inherit;
  margin-right: 6px;
  margin-bottom: 6px;
  padding: 10px;
  border: none;
  border-radius: 6px;
  outline: none;
  -webkit-appearance: none;
}
.CTT-pane-container input:focus {
  box-shadow: 0 0 0 2px #0096bfab;
}
.setting-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
}
.setting-row .col.description {
    display: flex;
    flex-grow: 0;
    flex-shrink: 0;
    flex-basis: auto;
    cursor: default;
    padding: 0 1vh;
}
.setting-row .col.action {
    display: flex;
    flex-grow: 7;
}
`;
			const dialog = document.createElement("dialog");
            const optionHeader = document.createElement("h3");
            optionHeader.innerText = "Options";
			const optionsContainer = document.createElement("div");
			optionsContainer.innerHTML = `
	<div class="setting-row">
		<label class="col description" for="ctt-format">Title Format</label>
		<div class="col action">
		</div>
	</div>`;

            const input = document.createElement("input");
            input.id = "ctt-track-format";
            input.value = userConfigs.trackFormat;
            input.onchange = () => formatChangeCallback(input);
            optionsContainer.querySelector(".col.action").append(input);
            dialog.append(optionHeader, optionsContainer);

			this.container.append(style, dialog);
        }
        toggleAt(x, y) {
            this.container.style.left = x + "px";
            this.container.style.top = y + 40 + "px";
            var dialog = this.container.querySelector("dialog");
            if (dialog.open) {
				dialog.close();
			}
			else {
				dialog.show();
			}
        }
    }  // end class


	// --- Begin Helpers
    const fetchTracks = async (trackIds) => {
		return CosmosAsync.get(`https://api.spotify.com/v1/tracks/?ids=${trackIds.join(',')}`);
    };
    const cacheFetchedTracks = async (fetchedTracks) => {
		fetchedTracks.tracks?.forEach((track) => {
			CACHE.set(track.id, {
				title: track.name,
				artists: track.artists,
			});
		});
    };

	// %FIELD% formatting
    const metaToString = (meta) => {
		const artistNames = Object.keys(meta.artists)
			.map((key) => meta.artists[key].name)
			.join(", ");
		const replacements = {
			"%ARTISTS%": artistNames,
			"%ARTIST%": meta.artists[0].name,
			"%TITLE%": meta.title,
		};
		return userConfigs.trackFormat.replace(/%\w+%/g, placeholder => replacements[placeholder] || placeholder);
    };

	// Handle textinput in settings
	function formatChangeCallback(inputEl) {
		const newVal = inputEl.value;
		userConfigs.trackFormat = newVal;
		LocalStorage.set(LOCALSTORAGE_KEY, newVal);
	}
	// --- End Helpers

	// OnClickCallback = (uris: string[], uids?: string[], contextUri?: string) => void;
    const ToClipboard = async (uris) => {
		let fetchExtraMessage = "";

		let uncachedIds =
		[...new Set(uris)]
			.reduce((a, uri) => {
				const base62 = URI.from(uri).getBase62Id();
				if (!CACHE.has(base62)) {
					a.push(base62);
				}
				return a;
			}, []);
		if (uncachedIds.length) {
			let fetchedTracks = { tracks: [] };
			try {
				fetchedTracks = await fetchTracks(uncachedIds);
			}
			catch (ex) {
				Spicetify.showNotification(`Error while obtaining tracks info from server: ${ex.toString()}`);
				return;
			}
			cacheFetchedTracks(fetchedTracks);
			fetchExtraMessage = ` — Queried ${fetchedTracks.tracks?.length} tracks from server.`;
		}

		let results = uris.reduce((a, uri) => {
			const base62 = URI.from(uri).getBase62Id();
			if (CACHE.has(base62)) {
				a.push(metaToString(CACHE.get(base62)));
			}
			return a;
		}, []);

		if (results.length) {
			await Platform.ClipboardAPI.copy(results.join("\n"));
			Spicetify.showNotification(`Copied ${results.length} items to clipboard${fetchExtraMessage}`);
		}
    }

    new Spicetify.ContextMenu.Item(
        CONTEXT_MENUITEM_TEXT,
        ToClipboard,
        ([uri]) => URI.isTrack(uri) && !URI.isLocalTrack(uri),  // shouldDisplayContextMenu(uris)
        "copy"
    ).register();

	// Create absolute-positioned Settings Pane
	const settingsPane = new CTTPane();
	document.body.append(settingsPane.container);

	const openConfig = (self) => {
		const { left, top } = self.element.getBoundingClientRect();
		settingsPane.toggleAt(left, top);
	};

    new Spicetify.Topbar.Button(
		TOPBAR_TOOLTIP_TEXT,
		"copy",
		openConfig
	);
})();

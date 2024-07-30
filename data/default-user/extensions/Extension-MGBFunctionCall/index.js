import { appendMediaToMessage, callPopup, extension_prompt_types, getRequestHeaders, saveSettingsDebounced, setExtensionPrompt, substituteParams } from '../../../../script.js';
import { appendFileContent, uploadFileAttachment } from '../../../chats.js';
import { doExtrasFetch, extension_settings, getApiUrl, getContext, modules, renderExtensionTemplate } from '../../../extensions.js';
import { registerDebugFunction } from '../../../power-user.js';
import { SECRET_KEYS, secret_state, writeSecret } from '../../../secrets.js';
import { registerSlashCommand } from '../../../slash-commands.js';
import { extractTextFromHTML, isFalseBoolean, isTrueBoolean, onlyUnique, trimToEndSentence, trimToStartSentence } from '../../../utils.js';

const storage = new localforage.createInstance({ name: 'SillyTavern_MGBFunctionCall' });
const extensionPromptMarker = '___MGBFunctionCall___';

const WEBSEARCH_SOURCES = {
    OPENAIAPI: 'openaiapi',
    EXTRAS: 'extras',
    PLUGIN: 'plugin',
};

const VISIT_TARGETS = {
    MESSAGE: 0,
    DATA_BANK: 1,
}


const defaultSettings = {
    triggerPhrasesEvents: [
        'on my calendar',
        'on my schedule',
        'upcoming events',
		'I have scheduled',
    ],
	triggerPhrasesScheduleEvent: [
		'schedule me an appointment',
		'add this to my calendar',
		'can you set me to',
		'can you schedule me',
	],
	    triggerPhrasesWorkTasks: [
		'work tasks I have open',
		'open work tasks',
		'check my work tasks',
		'check my work task list',
    ],
	    triggerPhrasesPersonalTasks: [
		'personal tasks I have open',
		'open personal tasks',
		'check my personal tasks',
		'check my personal task list',
    ],
	    triggerPhrasesCurrentWeather: [
		'current weather for',
        'the weather for',
    ],
    insertionTemplate: '***\nRelevant information from the query ({{query}}):\n{{text}}\n***',
    cacheLifetime: 60 * 60 * 24 * 7, // 1 week
    position: extension_prompt_types.IN_PROMPT,
    depth: 2,
    maxWords: 10,
    budget: 1500,
    source: WEBSEARCH_SOURCES.OPENAIAPI,
    extras_engine: 'google',
    visit_enabled: false,
    visit_target: VISIT_TARGETS.MESSAGE,
    visit_count: 3,
    visit_file_header: 'Web search results for "{{query}}"\n\n',
    visit_block_header: '---\nInformation from {{link}}\n\n{{text}}\n\n',
    visit_blacklist: [
        'youtube.com',
        'twitter.com',
        'facebook.com',
        'instagram.com',
    ],
    use_backticks: true,
    use_trigger_phrases: true,
};

async function isSearchAvailable() {
	console.debug('MGBFunctionCall: isSearchAvailable function entered');
    if (extension_settings.mgbfunctioncall.source === WEBSEARCH_SOURCES.OPENAIAPI && !secret_state[SECRET_KEYS.OPENAIAPI]) {
        console.debug('MGBFunctionCall: no SerpApi key found');
        return true;
    }

    if (extension_settings.mgbfunctioncall.source === WEBSEARCH_SOURCES.EXTRAS && !modules.includes('mgbfunctioncall')) {
        console.debug('MGBFunctionCall: no mgbfunctioncall Extras module');
        return false;
    }

    if (extension_settings.mgbfunctioncall.source === WEBSEARCH_SOURCES.PLUGIN && !(await probeSeleniumSearchPlugin())) {
        console.debug('MGBFunctionCall: no mgbfunctioncall server plugin');
        return false;
    }

    return true;
}

async function onMGBFunctionCallPrompt(chat) {
	console.debug('MGBFunctionCall: onMGBFunctionCallPrompt function entered');
    if (!extension_settings.mgbfunctioncall.enabled) {
        console.debug('MGBFunctionCall: extension is disabled');
        return;
    }

    if (!chat || !Array.isArray(chat) || chat.length === 0) {
        console.debug('MGBFunctionCall: chat is empty');
        return;
    }

    const startTime = Date.now();

    try {
        console.debug('MGBFunctionCall: resetting the extension prompt');
        setExtensionPrompt(extensionPromptMarker, '', extension_settings.mgbfunctioncall.position, extension_settings.mgbfunctioncall.depth);

        const isAvailable = await isSearchAvailable();

        if (!isAvailable) {
            return;
        }

        // Find the latest user message
        let searchQuery = '';
        let triggerMessage = null;

        for (let message of chat.slice().reverse()) {
            if (message.is_system) {
                continue;
            }

            if (message.mes && message.is_user) {
                if (isBreakCondition(message.mes)) {
                    break;
                }

                const query = extractSearchQuery(message.mes);

                if (!query) {
                    continue;
                }

                searchQuery = query;
                triggerMessage = message;
                break;
            }
        }

        if (!searchQuery) {
            console.debug('MGBFunctionCall: no user message found');
            return;
        }

        const { text, links } = await performSearchRequest(searchQuery, { useCache: true });

        if (!text) {
            console.debug('MGBFunctionCall: search failed');
            return;
        }

        if (extension_settings.mgbfunctioncall.visit_enabled && triggerMessage && Array.isArray(links) && links.length > 0) {
            const messageId = Number(triggerMessage.index);
            const visitResult = await visitLinksAndAttachToMessage(searchQuery, links, messageId);

            if (visitResult && visitResult.file) {
                triggerMessage.extra = Object.assign((triggerMessage.extra || {}), { file: visitResult.file });
                triggerMessage.mes = await appendFileContent(triggerMessage, triggerMessage.mes);
            }
        }

        // Insert the result into the prompt
        let template = extension_settings.mgbfunctioncall.insertionTemplate;

        if (!template) {
            console.debug('MGBFunctionCall: no insertion template found, using default');
            template = defaultSettings.insertionTemplate;
        }

        if (!(/{{text}}/i.test(template))) {
            console.debug('MGBFunctionCall: insertion template does not contain {{text}} macro, appending');
            template += '\n{{text}}';
        }

        const extensionPrompt = substituteParams(template.replace(/{{text}}/i, text).replace(/{{query}}/i, searchQuery));
        setExtensionPrompt(extensionPromptMarker, extensionPrompt, extension_settings.mgbfunctioncall.position, extension_settings.mgbfunctioncall.depth);
        console.debug('MGBFunctionCall: prompt updated', extensionPrompt);
    } catch (error) {
        console.error('MGBFunctionCall: error while processing the request', error);
    } finally {
        console.debug('MGBFunctionCall: finished in', Date.now() - startTime, 'ms');
    }
}

function isBreakCondition(message) {
	console.debug('MGBFunctionCall: isBreakCondition function entered');
    if (message && message.trim().startsWith('!')) {
        console.debug('MGBFunctionCall: message starts with an exclamation mark, stopping');
        return true;
    }

    return false;
}

/**
 * Extracts the search query from the message.
 * @param {string} message Message to extract the search query from
 * @returns {string} Search query
 */
function extractSearchQuery(message) {
	console.debug('MGBFunctionCall: extractSearchQuery function entered');
    if (message && message.trim().startsWith('.')) {
        console.debug('MGBFunctionCall: message starts with a dot, ignoring');
        return;
    }

    message = processInputText(message);

    if (!message) {
        console.debug('MGBFunctionCall: processed message is empty');
        return;
    }

    console.debug('MGBFunctionCall: processed message', message);

    if (extension_settings.mgbfunctioncall.use_backticks) {
        // Remove triple backtick blocks
        message = message.replace(/```[^`]+```/gi, '');
        // Find the first backtick-enclosed substring
        const match = message.match(/`([^`]+)`/i);

        if (match) {
            const query = match[1].trim();
            console.debug('MGBFunctionCall: backtick-enclosed substring found', query);
            return query;
        }
    }

    if (extension_settings.mgbfunctioncall.use_trigger_phrases) {
        // Find the first index of the trigger phrase in the message
        let triggerPhraseIndex = -1;
        let triggerPhraseActual = '';
		let foundTriggerPhrase = '';

		const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesEvents;

        for (let i = 0; i < triggerPhrases.length; i++) {
            const triggerPhrase = triggerPhrases[i].toLowerCase();
            const indexOf = message.indexOf(triggerPhrase);

            if (indexOf !== -1) {
                console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
                triggerPhraseIndex = indexOf;
                triggerPhraseActual = triggerPhrase;
				foundTriggerPhrase = triggerPhrase;
                break;
            }
        }

        if (triggerPhraseIndex === -1) {
			const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesWorkTasks;
			
			for (let i = 0; i < triggerPhrases.length; i++) {
				const triggerPhrase = triggerPhrases[i].toLowerCase();
				const indexOf = message.indexOf(triggerPhrase);

				if (indexOf !== -1) {
					console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
					triggerPhraseIndex = indexOf;
					triggerPhraseActual = triggerPhrase;
					foundTriggerPhrase = triggerPhrase;
					break;
				}
			}
			
			if (triggerPhraseIndex === -1) {
			
				const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesPersonalTasks;
			
				for (let i = 0; i < triggerPhrases.length; i++) {
					const triggerPhrase = triggerPhrases[i].toLowerCase();
					const indexOf = message.indexOf(triggerPhrase);

					if (indexOf !== -1) {
						console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
						triggerPhraseIndex = indexOf;
						triggerPhraseActual = triggerPhrase;
						foundTriggerPhrase = triggerPhrase;
						break;
					}
				}
				
				if (triggerPhraseIndex === -1) {
					const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesScheduleEvent;
				
					for (let i = 0; i < triggerPhrases.length; i++) {
						const triggerPhrase = triggerPhrases[i].toLowerCase();
						const indexOf = message.indexOf(triggerPhrase);

						if (indexOf !== -1) {
							console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
							triggerPhraseIndex = indexOf;
							triggerPhraseActual = triggerPhrase;
							foundTriggerPhrase = triggerPhrase;
							break;
						}
					}
					
					if (triggerPhraseIndex === -1) {
    					const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesCurrentWeather;
    				
    					for (let i = 0; i < triggerPhrases.length; i++) {
    						const triggerPhrase = triggerPhrases[i].toLowerCase();
    						const indexOf = message.indexOf(triggerPhrase);
    
    						if (indexOf !== -1) {
    							console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
    							triggerPhraseIndex = indexOf;
    							triggerPhraseActual = triggerPhrase;
    							foundTriggerPhrase = triggerPhrase;
    							break;
    						}
    					}
    					
    					if (triggerPhraseIndex === -1) {
    						console.debug('No trigger phrase found');
    						return;
    					}
					}
				}
			}
			
        }

        // Extract the relevant part of the message (after the trigger phrase)
     //   message = message.substring(triggerPhraseIndex + triggerPhraseActual.length).trim();
     //   console.debug('MGBFunctionCall: extracted query', message);

        // Limit the number of words
     //   const maxWords = extension_settings.mgbfunctioncall.maxWords;
     //   message = message.split(' ').slice(0, maxWords).join(' ');
     //   console.debug('MGBFunctionCall: query after word limit', message);

        return message;
    }
}



function extractSearchTriggerPhrase(message) {
	console.debug('MGBFunctionCall: extractSearchTriggerPhrase function entered');

    message = processInputText(message);

    if (!message) {
        console.debug('MGBFunctionCall: processed message is empty');
        return;
    }

    console.debug('MGBFunctionCall: processed message', message);

	if (extension_settings.mgbfunctioncall.use_trigger_phrases) {
		// Find the first index of the trigger phrase in the message
		let triggerPhraseIndex = -1;
		let triggerPhraseActual = '';
		let foundTriggerPhrase = '';

		const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesEvents;

		for (let i = 0; i < triggerPhrases.length; i++) {
			const triggerPhrase = triggerPhrases[i].toLowerCase();
			const indexOf = message.indexOf(triggerPhrase);

			if (indexOf !== -1) {
				console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
				triggerPhraseIndex = indexOf;
				triggerPhraseActual = 'ScheduledEvents';
				foundTriggerPhrase = triggerPhrase;
				break;
			}
		}

		if (triggerPhraseIndex === -1) {
			const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesWorkTasks;
			
			for (let i = 0; i < triggerPhrases.length; i++) {
				const triggerPhrase = triggerPhrases[i].toLowerCase();
				const indexOf = message.indexOf(triggerPhrase);

				if (indexOf !== -1) {
					console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
					triggerPhraseIndex = indexOf;
					triggerPhraseActual = 'WorkTasks';
					foundTriggerPhrase = triggerPhrase;
					break;
				}
			}
			
			if (triggerPhraseIndex === -1) {
			
				const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesPersonalTasks;
			
				for (let i = 0; i < triggerPhrases.length; i++) {
					const triggerPhrase = triggerPhrases[i].toLowerCase();
					const indexOf = message.indexOf(triggerPhrase);

					if (indexOf !== -1) {
						console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
						triggerPhraseIndex = indexOf;
						triggerPhraseActual = 'PersonalTasks';
						foundTriggerPhrase = triggerPhrase;
						break;
					}
				}
				
				if (triggerPhraseIndex === -1) {
					const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesScheduleEvent;
				
					for (let i = 0; i < triggerPhrases.length; i++) {
						const triggerPhrase = triggerPhrases[i].toLowerCase();
						const indexOf = message.indexOf(triggerPhrase);

						if (indexOf !== -1) {
							console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
							triggerPhraseIndex = indexOf;
							triggerPhraseActual = 'CreateEvent';
							foundTriggerPhrase = triggerPhrase;
							break;
						}
					}
					
					if (triggerPhraseIndex === -1) {
    					const triggerPhrases = extension_settings.mgbfunctioncall.triggerPhrasesCurrentWeather;
    				
    					for (let i = 0; i < triggerPhrases.length; i++) {
    						const triggerPhrase = triggerPhrases[i].toLowerCase();
    						const indexOf = message.indexOf(triggerPhrase);
    
    						if (indexOf !== -1) {
    							console.debug(`MGBFunctionCall: trigger phrase found "${triggerPhrase}" at index ${indexOf}`);
    							triggerPhraseIndex = indexOf;
    							triggerPhraseActual = 'CurrentWeather';
    							foundTriggerPhrase = triggerPhrase;
    							break;
    						}
    					}
    					
    					if (triggerPhraseIndex === -1) {
    						console.debug('No trigger phrase found');
    						return;
    					}
					}
				}
			}
			
		}

		return triggerPhraseActual;
	}
	
}


/**
 * Pre-process search query input text.
 * @param {string} text Input text
 * @returns {string} Processed text
 */
function processInputText(text) {
	console.debug('MGBFunctionCall: processInputText function entered');
    // Convert to lowercase
    text = text.toLowerCase();
    // Remove punctuation
    text = text.replace(/[\\.,@#!?$%&;:{}=_~[\]]/g, '');
    // Remove double quotes (including region-specific ones)
    text = text.replace(/["“”]/g, '');
    // Remove carriage returns
    text = text.replace(/\r/g, '');
    // Replace newlines with spaces
    text = text.replace(/[\n]+/g, ' ');
    // Collapse multiple spaces into one
    text = text.replace(/\s+/g, ' ');
    // Trim
    text = text.trim();

    return text;
}

/**
 * Checks if the provided link is allowed to be visited or blacklisted.
 * @param {string} link Link to check
 * @returns {boolean} Whether the link is allowed
 */
function isAllowedUrl(link) {
	console.debug('MGBFunctionCall: isAllowedUrl function entered');
    try {
        const url = new URL(link);
        const isBlacklisted = extension_settings.mgbfunctioncall.visit_blacklist.some(y => url.hostname.includes(y));
        if (isBlacklisted) {
            console.debug('MGBFunctionCall: blacklisted link', link);
        }
        return !isBlacklisted;
    } catch (error) {
        console.debug('MGBFunctionCall: invalid link', link);
        return false;
    }
}

/**
 * Visits the provided web links and extracts the text from the resulting HTML.
 * @param {string} query Search query
 * @param {string[]} links Array of links to visit
 * @returns {Promise<string>} Extracted text
 */
async function visitLinks(query, links) {
	console.debug('MGBFunctionCall: visitLinks function entered');
    if (!Array.isArray(links)) {
        console.debug('MGBFunctionCall: not an array of links');
        return '';
    }

    links = links.filter(isAllowedUrl);

    if (links.length === 0) {
        console.debug('MGBFunctionCall: no links to visit');
        return '';
    }

    const visitCount = extension_settings.mgbfunctioncall.visit_count;
    const visitPromises = [];

    for (let i = 0; i < Math.min(visitCount, links.length); i++) {
        const link = links[i];
        visitPromises.push(visitLink(link));
    }

    const visitResult = await Promise.allSettled(visitPromises);

    let linkResult = '';

    for (let result of visitResult) {
        if (result.status === 'fulfilled' && result.value) {
            const { link, text } = result.value;

            if (text) {
                linkResult += substituteParams(extension_settings.mgbfunctioncall.visit_block_header.replace(/{{query}}/i, query).replace(/{{link}}/i, link).replace(/{{text}}/i, text));
            }
        }
    }

    if (!linkResult) {
        console.debug('MGBFunctionCall: no text to attach');
        return '';
    }

    const fileHeader = substituteParams(extension_settings.mgbfunctioncall.visit_file_header.replace(/{{query}}/i, query));
    const fileText = fileHeader + linkResult;
    return fileText;
}

/**
 * Visits the provided web links and attaches the resulting text to the chat as a file.
 * @param {string} query Search query
 * @param {string[]} links Web links to visit
 * @param {number} messageId Message ID that triggered the search
 * @returns {Promise<{fileContent: string, file: object}>} File content and file object
 */
async function visitLinksAndAttachToMessage(query, links, messageId) {
	console.debug('MGBFunctionCall: visitLinksAndAttachToMessage function entered');
    if (isNaN(messageId)) {
        console.debug('MGBFunctionCall: invalid message ID');
        return;
    }

    const context = getContext();
    const message = context.chat[messageId];

    if (!message) {
        console.debug('MGBFunctionCall: failed to find the message');
        return;
    }

    if (message?.extra?.file) {
        console.debug('MGBFunctionCall: message already has a file attachment');
        return;
    }

    if (!message.extra) {
        message.extra = {};
    }

    try {
        if (extension_settings.mgbfunctioncall.visit_target === VISIT_TARGETS.DATA_BANK) {
            const fileExists = await isFileExistsInDataBank(query);

            if (fileExists) {
                return;
            }
        }

        const fileName = `mgbfunctioncall - ${query} - ${Date.now()}.txt`;
        const fileText = await visitLinks(query, links);

        if (!fileText) {
            return;
        }

        if (extension_settings.mgbfunctioncall.visit_target === VISIT_TARGETS.DATA_BANK) {
            await uploadToDataBank(fileName, fileText);
        } else {
            const base64Data = window.btoa(unescape(encodeURIComponent(fileText)));
            const fileUrl = await uploadFileAttachment(fileName, base64Data);

            if (!fileUrl) {
                console.debug('MGBFunctionCall: failed to upload the file');
                return;
            }

            message.extra.file = {
                url: fileUrl,
                size: fileText.length,
                name: fileName,
            };

            const messageElement = $(`.mes[mesid="${messageId}"]`);

            if (messageElement.length === 0) {
                console.debug('MGBFunctionCall: failed to find the message element');
                return;
            }

            appendMediaToMessage(message, messageElement);
            return { fileContent: fileText, file: message.extra.file };
        }
    } catch (error) {
        console.error('MGBFunctionCall: failed to attach the file', error);
    }
}

/**
 * Checks if the file for the search query already exists in the Data Bank.
 * @param {string} query Search query
 * @returns {Promise<boolean>} Whether the file exists
 */
async function isFileExistsInDataBank(query) {
	console.debug('MGBFunctionCall: isFileExistsInDataBank function entered');
    try {
        const { getDataBankAttachmentsForSource } = await import('../../../chats.js');
        const attachments = await getDataBankAttachmentsForSource('chat');
        const existingAttachment = attachments.find(x => x.name.startsWith(`mgbfunctioncall - ${query} - `));
        if (existingAttachment) {
            console.debug('MGBFunctionCall: file for such query already exists in the Data Bank');
            return true;
        }
        return false;
    } catch (error) {
        // Prevent visiting links if the Data Bank is not available
        toastr.error('Data Bank module is not available');
        console.error('MGBFunctionCall: failed to check if the file exists in the Data Bank', error);
        return true;
    }
}

/**
 * Uploads the file to the Data Bank.
 * @param {string} fileName File name
 * @param {string} fileText File text
 * @returns {Promise<void>}
 */
async function uploadToDataBank(fileName, fileText) {
	console.debug('MGBFunctionCall: uploadToDataBank function entered');
    try {
        const { uploadFileAttachmentToServer } = await import('../../../chats.js');
        const file = new File([fileText], fileName, { type: 'text/plain' });
        await uploadFileAttachmentToServer(file, 'chat');
    } catch (error) {
        console.error('MGBFunctionCall: failed to import the chat module', error);
    }
}

/**
 * Visits the provided web link and extracts the text from the resulting HTML.
 * @param {string} link Web link to visit
 * @returns {Promise<{link: string, text:string}>} Extracted text
 */
async function visitLink(link) {
	console.debug('MGBFunctionCall: visitLink function entered');
    try {
        const result = await fetch('/api/search/visit', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url: link }),
        });

        if (!result.ok) {
            console.debug(`MGBFunctionCall: visit request failed with status ${result.statusText}`, link);
            return;
        }

        const data = await result.blob();
        const text = await extractTextFromHTML(data, 'p'); // Only extract text from <p> tags
        console.debug('MGBFunctionCall: visit result', link, text);
        return { link, text };
    } catch (error) {
        console.error('MGBFunctionCall: visit failed', error);
    }
}

/**
 * Performs a search query via SerpApi.
 * @param {string} query Search query
 * @returns {Promise<{textBits: string[], links: string[]}>} Lines of search results.
 */
async function doSerpApiQuery(query) {
	
	const foundThisTrigger = await extractSearchTriggerPhrase(query);
	console.debug('MGBFunctionCall: doSerpApiQuery function entered');
	if (!foundThisTrigger) {
		console.debug('MGBFunctionCall: foundThisTrigger Not Populated');
		return;		
	} else {
		// https://eovet8rkjrlq0of.m.pipedream.net
		if ( foundThisTrigger == 'ScheduledEvents') {
		  const  result = await fetch('https://eovet8rkjrlq0of.m.pipedream.net', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({ query }),
			});

			if (!result.ok) {
				const text = await result.text();
				console.debug('MGBFunctionCall: search request failed', result.statusText, text);
				return;
			}

			const data = await result.json();
			const dataJson = JSON.stringify(data);
			

			let links = [];

			return dataJson;
		}
		
		if ( foundThisTrigger == 'CreateEvent') {
		  const  result = await fetch('https://eo8uirapyxamvq9.m.pipedream.net', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({ query }),
			});

			//	if (!result.ok) {
			//		const text = await result.text();
			//		console.debug('MGBFunctionCall: search request failed', result.statusText, text);
			//		return;
			//	}

			const data = await result.json();
			const dataJson = JSON.stringify({'CalendarEvent': 'The event request has been created'});
			

			let links = [];

			return dataJson;
		}
		
		// https://eo8yfwd4tcp5z0j.m.pipedream.net
		if ( foundThisTrigger == 'WorkTasks') {
		  const  result = await fetch('https://eo8yfwd4tcp5z0j.m.pipedream.net', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({'ConversationKey': 'Work'}),
			});

			if (!result.ok) {
				const text = await result.text();
				console.debug('MGBFunctionCall: search request failed', result.statusText, text);
				return;
			}

			const data = await result.json();
			const dataJson = JSON.stringify(data);
			

			let links = [];

			return dataJson;
		}
		
		if ( foundThisTrigger == 'PersonalTasks') {
		  const  result = await fetch('https://eo8yfwd4tcp5z0j.m.pipedream.net', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({'ConversationKey': 'Personal'}),
			});

			if (!result.ok) {
				const text = await result.text();
				console.debug('MGBFunctionCall: search request failed', result.statusText, text);
				return;
			}

			const data = await result.json();
			const dataJson = JSON.stringify(data);
			

			let links = [];

			return dataJson;
		}

        		if ( foundThisTrigger == 'CurrentWeather') {
		  const  result = await fetch('https://eo8uirapyxamvq9.m.pipedream.net', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({ query }),
			});

			if (!result.ok) {
				const text = await result.text();
				console.debug('MGBFunctionCall: search request failed', result.statusText, text);
				return;
			}

			const data = await result.json();
			const dataJson = JSON.stringify(data);
			

			let links = [];

			return dataJson;
		}
		
	}
	
}

/**
 * Performs a search query via Extras API.
 * @param {string} query Search query
 * @returns {Promise<{textBits: string[], links: string[]}>} Lines of search results.
 */
async function doExtrasApiQuery(query) {
	console.debug('MGBFunctionCall: doExtrasApiQuery function entered');
    const url = new URL(getApiUrl());
    url.pathname = '/api/mgbfunctioncall';
    const result = await doExtrasFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'bypass',
        },
        body: JSON.stringify({
            query: query,
            engine: extension_settings.mgbfunctioncall.extras_engine,
        }),
    });

    if (!result.ok) {
        const text = await result.text();
        console.debug('MGBFunctionCall: search request failed', result.statusText, text);
        return;
    }

    const data = await result.json();
    console.debug('MGBFunctionCall: search response', data);

    const textBits = data.results.split('\n');
    const links = Array.isArray(data.links) ? data.links : [];
    return { textBits };
}

/**
 * Performs a search query via the Selenium search plugin.
 * @param {string} query Search query
 * @returns {Promise<{textBits: string[], links: string[]}>} Lines of search results.
 */
async function doSeleniumPluginQuery(query) {
	console.debug('MGBFunctionCall: doSeleniumPluginQuery function entered');
    const result = await fetch('/api/plugins/selenium/search', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            query: query,
            engine: extension_settings.mgbfunctioncall.extras_engine,
        }),
    });

    if (!result.ok) {
        const text = await result.text();
        console.debug('MGBFunctionCall: search request failed', result.statusText, text);
        return;
    }

    const data = await result.json();
    console.debug('MGBFunctionCall: search response', data);

    const textBits = data.results.split('\n');
    const links = Array.isArray(data.links) ? data.links : [];
    return { textBits };
}

/**
 * Probes the Selenium search plugin to check if it's available.
 * @returns {Promise<boolean>} Whether the plugin is available
 */
async function probeSeleniumSearchPlugin() {
	console.debug('MGBFunctionCall: probeSeleniumSearchPlugin function entered');
    try {
        const result = await fetch('/api/plugins/selenium/probe', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!result.ok) {
            console.debug('MGBFunctionCall: plugin probe failed', result.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('MGBFunctionCall: plugin probe failed', error);
        return false;
    }
}

/**
 *
 * @param {string} query Search query
 * @param {SearchRequestOptions} options Search request options
 * @typedef {{useCache?: boolean}} SearchRequestOptions
 * @returns {Promise<{text:string, links: string[]}>} Extracted text
 */
async function performSearchRequest(query, options = { useCache: false }) {
	console.debug('MGBFunctionCall: performSearchRequest function entered');
    // Check if the query is cached
    const cacheKey = `query_${query}`;
    const cacheLifetime = extension_settings.mgbfunctioncall.cacheLifetime;
    const cachedResult = await storage.getItem(cacheKey);

//    if (options.useCache && cachedResult) {
//        console.debug('MGBFunctionCall: cached result found', cachedResult);
        // Check if the cache is expired
//        if (cachedResult.timestamp + cacheLifetime * 1000 < Date.now()) {
//            console.debug('MGBFunctionCall: cached result is expired, requerying');
//            await storage.removeItem(cacheKey);
//        } else {
//            console.debug('MGBFunctionCall: cached result is valid');
//            return { text: cachedResult.text, links: cachedResult.links };
//        }
//    }

    /**
     * @returns {Promise<{textBits: string[], links: string[]}>}
     */
    async function callSearchSource() {
        try {
            switch (extension_settings.mgbfunctioncall.source) {
                case WEBSEARCH_SOURCES.OPENAIAPI:
                    return await doSerpApiQuery(query);
                case WEBSEARCH_SOURCES.EXTRAS:
                    return await doExtrasApiQuery(query);
                case WEBSEARCH_SOURCES.PLUGIN:
                    return await doSeleniumPluginQuery(query);
                default:
                    throw new Error(`Unrecognized search source: ${extension_settings.mgbfunctioncall.source}`);
            }
        } catch (error) {
            console.error('MGBFunctionCall: search failed', error);
            return textBits;
        }
    }

    const textBits = await callSearchSource();
    const budget = extension_settings.mgbfunctioncall.budget;
    let text = textBits;
	let links = [];

   

    if (!text) {
        console.debug('MGBFunctionCall: search produced no text');
        return { text: '', links: [] };
    }

    console.debug(`MGBFunctionCall: extracted text (length = ${text.length}, budget = ${budget})`, text);

    // Save the result to cache
    if (options.useCache) {
        await storage.setItem(cacheKey, { text: text, links: links, timestamp: Date.now() });
    }

    return { text, links };
}

window['MGBFunctionCall_Intercept'] = onMGBFunctionCallPrompt;

/**
 * Provides an interface for the Data Bank to interact with the extension.
 */
class MGBFunctionCallScraper {
	 
    constructor() {
        this.id = 'mgbfunctioncall';
        this.name = 'MGB Function Call';
        this.description = 'Perform a web search and download the results.';
        this.iconClass = 'fa-solid fa-search';
    }


    /**
     * Check if the scraper is available.
     * @returns {Promise<boolean>} Whether the scraper is available
     */
    async isAvailable() {
        return await isSearchAvailable();
    }

    /**
     * Scrape file attachments from a webpage.
     * @returns {Promise<File[]>} File attachments scraped from the webpage
     */
    async scrape() {
        try {
            const template = $(await renderExtensionTemplate('third-party/Extension-MGBFunctionCall', 'search-scrape', {}));
            let query = '';
            let maxResults = extension_settings.mgbfunctioncall.visit_count;
            let output = 'multiple';
            let snippets = false;
            template.find('input[name="searchScrapeQuery"]').on('input', function () {
                query = String($(this).val());
            });
            template.find('input[name="searchScrapeMaxResults"]').val(maxResults).on('input', function () {
                maxResults = Number($(this).val());
            });
            template.find('input[name="searchScrapeOutput"]').on('input', function () {
                output = String($(this).val());
            });
            template.find('input[name="searchScrapeSnippets"]').on('change', function () {
                snippets = $(this).prop('checked');
            });

            const confirm = await callPopup(template, 'confirm', '', { confirmText: 'Scrape', cancelText: 'Cancel' });

            if (!confirm) {
                return;
            }

            const toast = toastr.info('Working, please wait...');
            const searchResult = await performSearchRequest(query, { useCache: false });

            if (!Array.isArray(searchResult?.links) || searchResult.links.length === 0) {
                console.debug('MGBFunctionCall: no links to scrape');
                return [];
            }

            const visitResults = [];

            for (let i = 0; i < searchResult.links.length; i++) {
                if (i >= maxResults) {
                    break;
                }

                const link = searchResult.links[i];

                if (!isAllowedUrl(link)) {
                    continue;
                }

                const visitResult = await visitLink(link);

                if (visitResult) {
                    visitResults.push(visitResult);
                }
            }

            const files = [];

            if (snippets) {
                const fileName = `snippets - ${query} - ${Date.now()}.txt`;
                const file = new File([searchResult.text], fileName, { type: 'text/plain' });
                files.push(file);
            }

            if (output === 'single') {
                let result = '';

                for (const visitResult of visitResults) {
                    if (visitResult.text) {
                        result += substituteParams(extension_settings.mgbfunctioncall.visit_block_header
                            .replace(/{{query}}/i, query)
                            .replace(/{{link}}/i, visitResult.link)
                            .replace(/{{text}}/i, visitResult.text));
                    }
                }

                const fileHeader = substituteParams(extension_settings.mgbfunctioncall.visit_file_header.replace(/{{query}}/i, query));
                const fileText = fileHeader + result;
                const fileName = `mgbfunctioncall - ${query} - ${Date.now()}.txt`;
                const file = new File([fileText], fileName, { type: 'text/plain' });
                files.push(file);
            }

            if (output === 'multiple') {
                for (const result of visitResults) {
                    if (result.text) {
                        const domain = new URL(result.link).hostname;
                        const fileName = `${query} - ${domain} - ${Date.now()}.txt`;
                        const file = new File([result.text], fileName, { type: 'text/plain' });
                        files.push(file);
                    }
                }
            }

            toastr.clear(toast);
            return files;
        } catch (error) {
            console.error('MGBFunctionCall: error while scraping', error);
        }
    }
}

jQuery(async () => {
	console.debug('MGBFunctionCall: initial Jquery entered');
    if (!extension_settings.mgbfunctioncall) {
		console.debug('MGBFunctionCall: jQuery settings not detected restore default');
        extension_settings.mgbfunctioncall = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings.mgbfunctioncall[key] === undefined) {
			console.debug('MGBFunctionCall: JQuery the key is undefined');
            extension_settings.mgbfunctioncall[key] = defaultSettings[key];
        }
    }

    const html = renderExtensionTemplate('third-party/Extension-MGBFunctionCall', 'settings');

    function switchSourceSettings() {
		console.debug('MGBFunctionCall: JQuery load openaiapi settings');
        $('#mgbfunctioncall_extras_settings').toggle(extension_settings.mgbfunctioncall.source === 'extras' || extension_settings.mgbfunctioncall.source === 'plugin');
        $('#openaiapi_settings').toggle(extension_settings.mgbfunctioncall.source === 'openaiapi');
    }
	
	console.debug('MGBFunctionCall: JQuery start save settings section');

    $('#extensions_settings2').append(html);
    $('#mgbfunctioncall_source').val(extension_settings.mgbfunctioncall.source);
    $('#mgbfunctioncall_source').on('change', () => {
        extension_settings.mgbfunctioncall.source = String($('#mgbfunctioncall_source').find(':selected').val());
        switchSourceSettings();
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_enabled').prop('checked', extension_settings.mgbfunctioncall.enabled);
    $('#mgbfunctioncall_enabled').on('change', () => {
        extension_settings.mgbfunctioncall.enabled = !!$('#mgbfunctioncall_enabled').prop('checked');
        setExtensionPrompt(extensionPromptMarker, '', extension_settings.mgbfunctioncall.position, extension_settings.mgbfunctioncall.depth);
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_extras_engine').val(extension_settings.mgbfunctioncall.extras_engine);
    $('#mgbfunctioncall_extras_engine').on('change', () => {
        extension_settings.mgbfunctioncall.extras_engine = String($('#mgbfunctioncall_extras_engine').find(':selected').val());
        saveSettingsDebounced();
    });
    $('#openaiapi_key').toggleClass('success', !!secret_state[SECRET_KEYS.OPENAIAPI]);
    $('#openaiapi_key').on('click', async () => {
        const key = await callPopup('<h3>Add a SerpApi key</h3>', 'input', '', { rows: 2 });

        if (key) {
            await writeSecret(SECRET_KEYS.OPENAIAPI, key.trim());
        }

        $('#openaiapi_key').toggleClass('success', !!secret_state[SECRET_KEYS.OPENAIAPI]);
    });
    $('#mgbfunctioncall_budget').val(extension_settings.mgbfunctioncall.budget);
    $('#mgbfunctioncall_budget').on('input', () => {
        extension_settings.mgbfunctioncall.budget = Number($('#mgbfunctioncall_budget').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_trigger_phrases_events').val(extension_settings.mgbfunctioncall.triggerPhrasesEvents.join('\n'));
    $('#mgbfunctioncall_trigger_phrases_events').on('input', () => {
        extension_settings.mgbfunctioncall.triggerPhrasesEvents = String($('#mgbfunctioncall_trigger_phrases_events').val()).split('\n');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_trigger_phrases_scheduleevent').val(extension_settings.mgbfunctioncall.triggerPhrasesScheduleEvent.join('\n'));
    $('#mgbfunctioncall_trigger_phrases_scheduleevent').on('input', () => {
        extension_settings.mgbfunctioncall.triggerPhrasesScheduleEvent = String($('#mgbfunctioncall_trigger_phrases_scheduleevent').val()).split('\n');
        saveSettingsDebounced();
    });
	$('#mgbfunctioncall_trigger_phrases_worktasks').val(extension_settings.mgbfunctioncall.triggerPhrasesWorkTasks.join('\n'));
    $('#mgbfunctioncall_trigger_phrases_worktasks').on('input', () => {
        extension_settings.mgbfunctioncall.triggerPhrasesWorkTasks = String($('#mgbfunctioncall_trigger_phrases_worktasks').val()).split('\n');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_trigger_phrases_personaltasks').val(extension_settings.mgbfunctioncall.triggerPhrasesPersonalTasks.join('\n'));
    $('#mgbfunctioncall_trigger_phrases_personaltasks').on('input', () => {
        extension_settings.mgbfunctioncall.triggerPhrasesPersonalTasks = String($('#mgbfunctioncall_trigger_phrases_personaltasks').val()).split('\n');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_trigger_phrases_currentweather').val(extension_settings.mgbfunctioncall.triggerPhrasesCurrentWeather.join('\n'));
    $('#mgbfunctioncall_trigger_phrases_currentweather').on('input', () => {
        extension_settings.mgbfunctioncall.triggerPhrasesCurrentWeather = String($('#mgbfunctioncall_trigger_phrases_currentweather').val()).split('\n');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_cache_lifetime').val(extension_settings.mgbfunctioncall.cacheLifetime);
    $('#mgbfunctioncall_cache_lifetime').on('input', () => {
        extension_settings.mgbfunctioncall.cacheLifetime = Number($('#mgbfunctioncall_cache_lifetime').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_max_words').val(extension_settings.mgbfunctioncall.maxWords);
    $('#mgbfunctioncall_max_words').on('input', () => {
        extension_settings.mgbfunctioncall.maxWords = Number($('#mgbfunctioncall_max_words').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_template').val(extension_settings.mgbfunctioncall.insertionTemplate);
    $('#mgbfunctioncall_template').on('input', () => {
        extension_settings.mgbfunctioncall.insertionTemplate = String($('#mgbfunctioncall_template').val());
        saveSettingsDebounced();
    });
    $(`input[name="mgbfunctioncall_position"][value="${extension_settings.mgbfunctioncall.position}"]`).prop('checked', true);
    $('input[name="mgbfunctioncall_position"]').on('change', () => {
        extension_settings.mgbfunctioncall.position = Number($('input[name="mgbfunctioncall_position"]:checked').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_depth').val(extension_settings.mgbfunctioncall.depth);
    $('#mgbfunctioncall_depth').on('input', () => {
        extension_settings.mgbfunctioncall.depth = Number($('#mgbfunctioncall_depth').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_visit_enabled').prop('checked', extension_settings.mgbfunctioncall.visit_enabled);
    $('#mgbfunctioncall_visit_enabled').on('change', () => {
        extension_settings.mgbfunctioncall.visit_enabled = !!$('#mgbfunctioncall_visit_enabled').prop('checked');
        saveSettingsDebounced();
    });
    $(`input[name="mgbfunctioncall_visit_target"][value="${extension_settings.mgbfunctioncall.visit_target}"]`).prop('checked', true);
    $('input[name="mgbfunctioncall_visit_target"]').on('input', () => {
        extension_settings.mgbfunctioncall.visit_target = Number($('input[name="mgbfunctioncall_visit_target"]:checked').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_visit_count').val(extension_settings.mgbfunctioncall.visit_count);
    $('#mgbfunctioncall_visit_count').on('input', () => {
        extension_settings.mgbfunctioncall.visit_count = Number($('#mgbfunctioncall_visit_count').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_visit_blacklist').val(extension_settings.mgbfunctioncall.visit_blacklist.join('\n'));
    $('#mgbfunctioncall_visit_blacklist').on('input', () => {
        extension_settings.mgbfunctioncall.visit_blacklist = String($('#mgbfunctioncall_visit_blacklist').val()).split('\n');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_file_header').val(extension_settings.mgbfunctioncall.visit_file_header);
    $('#mgbfunctioncall_file_header').on('input', () => {
        extension_settings.mgbfunctioncall.visit_file_header = String($('#mgbfunctioncall_file_header').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_block_header').val(extension_settings.mgbfunctioncall.visit_block_header);
    $('#mgbfunctioncall_block_header').on('input', () => {
        extension_settings.mgbfunctioncall.visit_block_header = String($('#mgbfunctioncall_block_header').val());
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_use_backticks').prop('checked', extension_settings.mgbfunctioncall.use_backticks);
    $('#mgbfunctioncall_use_backticks').on('change', () => {
        extension_settings.mgbfunctioncall.use_backticks = !!$('#mgbfunctioncall_use_backticks').prop('checked');
        saveSettingsDebounced();
    });
    $('#mgbfunctioncall_use_trigger_phrases').prop('checked', extension_settings.mgbfunctioncall.use_trigger_phrases);
    $('#mgbfunctioncall_use_trigger_phrases').on('change', () => {
        extension_settings.mgbfunctioncall.use_trigger_phrases = !!$('#mgbfunctioncall_use_trigger_phrases').prop('checked');
        saveSettingsDebounced();
    });

console.debug('MGBFunctionCall: JQuery end save settings section');

    switchSourceSettings();

    registerDebugFunction('clearMGBFunctionCallCache', 'Clear the MGBFunctionCall cache', 'Removes all search results stored in the local cache.', async () => {
        await storage.clear();
        console.debug('MGBFunctionCall: cache cleared');
        toastr.success('MGBFunctionCall: cache cleared');
    });

    registerDebugFunction('testMGBFunctionCall', 'Test the MGBFunctionCall extension', 'Performs a test search using the current settings.', async () => {
        try {
            const text = prompt('Enter a test message', 'How to make a sandwich');

            if (!text) {
                return;
            }

            const result = await performSearchRequest(text, { useCache: false });
            console.debug('MGBFunctionCall: test result', text, result.text, result.links);
            alert(result.text);
        } catch (error) {
            toastr.error(String(error), 'MGBFunctionCall: test failed');
        }
    });

    registerSlashCommand('mgbfunctioncall', async (args, query) => {
		console.debug('MGBFunctionCall: JQuery registerSlashCommand function entered');
        const includeSnippets = !isFalseBoolean(args.snippets);
        const includeLinks = isTrueBoolean(args.links);

        if (!query) {
            toastr.warning('No search query specified');
            return '';
        }

        if (!includeSnippets && !includeLinks) {
            toastr.warning('No search result type specified');
            return '';
        }
		console.debug('MGBFunctionCall: JQuery registerSlashCommand function calls to performSearchRequest function');
        const result = await performSearchRequest(query, { useCache: true });

        let output = includeSnippets ? result.text : '';

        if (includeLinks && Array.isArray(result.links) && result.links.length > 0) {
            const visitResult = await visitLinks(query, result.links);
            output += '\n' + visitResult;
        }
		console.debug('MGBFunctionCall: JQuery registerSlashCommand output = ' + output);
        return output;
		
    }, [], '<span class="monospace">(links=on|off snippets=on|off [query])</span> – performs a web search query. Use named arguments to specify what to return - page snippets (default: on) or full parsed pages (default: off) or both.', true, true);

    const context = getContext();
	console.debug('MGBFunctionCall: JQuery getContext function called. context = ' + context);
    if (typeof context.registerDataBankScraper === 'function') {
		console.debug('MGBFunctionCall: JQuery type of Context = registerDataBankScraper');
        context.registerDataBankScraper(new MGBFunctionCallScraper());
    }
	
	$(document).ready(function () {
        $('#mgbfunctioncall_fcTriggerSelect').change(function () {
            if ($('#mgbfunctioncall_fcTriggerSelect').val() == 'retrieveEvents') {
                $('#mgbfunctioncall_trigger_phrases_events').show();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').hide();
				$('#mgbfunctioncall_trigger_phrases_worktasks').hide();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').hide(); 
                $('#mgbfunctioncall_trigger_phrases_currentweather').hide();
            } else if ($('#mgbfunctioncall_fcTriggerSelect').val() == 'scheduleEvent') {
                $('#mgbfunctioncall_trigger_phrases_events').hide();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').show();
				$('#mgbfunctioncall_trigger_phrases_worktasks').hide();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').hide();
                $('#mgbfunctioncall_trigger_phrases_currentweather').hide();
			} else if ($('#mgbfunctioncall_fcTriggerSelect').val() == 'workTasks') {
                $('#mgbfunctioncall_trigger_phrases_events').hide();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').hide();
				$('#mgbfunctioncall_trigger_phrases_worktasks').show();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').hide();	
                $('#mgbfunctioncall_trigger_phrases_currentweather').hide();
			} else if ($('#mgbfunctioncall_fcTriggerSelect').val() == 'personalTasks') {
                $('#mgbfunctioncall_trigger_phrases_events').hide();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').hide();
				$('#mgbfunctioncall_trigger_phrases_worktasks').hide();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').show();
                $('#mgbfunctioncall_trigger_phrases_currentweather').hide();
			} else if ($('#mgbfunctioncall_fcTriggerSelect').val() == 'currentWeather') {
                $('#mgbfunctioncall_trigger_phrases_events').hide();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').hide();
				$('#mgbfunctioncall_trigger_phrases_worktasks').hide();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').hide();
                $('#mgbfunctioncall_trigger_phrases_currentweather').show();
			} else {
				console.log('No Data Chosen in MGB Function Trigger Phrase Menu Select. Restoring Default.');
				$('#mgbfunctioncall_trigger_phrases_events').hide();
				$('#mgbfunctioncall_trigger_phrases_scheduleevent').hide();
				$('#mgbfunctioncall_trigger_phrases_worktasks').hide();
				$('#mgbfunctioncall_trigger_phrases_personaltasks').hide();
                $('#mgbfunctioncall_trigger_phrases_currentweather').hide();
			}
        });
    });
	
});

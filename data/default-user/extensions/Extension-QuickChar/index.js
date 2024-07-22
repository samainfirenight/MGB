import { animation_duration, eventSource, event_types, getThumbnailUrl, getCharacters, Generate } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { retriggerFirstMessageOnEmptyChat, getUserAvatar, getUserAvatars, setUserAvatar, user_avatar } from '../../../personas.js';
import { getGroupMembers, findGroupMemberId } from '../../../group-chats.js';

let popper = null;
let isOpen = false;

function addQuickPersonaButton() {
    const quickPersonaButton = `
    <div id="quickPersonaTwo" class="interactable" tabindex="0">
        <img id="quickPersonaImgTwo" src="/img/ai4.png" />
        <div id="quickPersonaCaretTwo" class="fa-fw fa-solid fa-caret-up"></div>
    </div>`;
    $('#leftSendForm').append(quickPersonaButton);
    $('#quickPersonaTwo').on('click', () => {
        toggleQuickPersonaSelector();
    });
}

async function toggleQuickPersonaSelector() {
    if (isOpen) {
        closeQuickPersonaSelector();
        return;
    }
    await openQuickPersonaSelector();
}

async function openQuickPersonaSelector() {
    isOpen = true;
    // const userAvatars = await getUserAvatars(false);
	const userAvatars = await getGroupMembers();
    const quickPersonaList = $('<div id="quickPersonaMenuTwo"><ul class="list-group"></ul></div>');
//	const avatar = getThumbnailUrl('avatar', character.avatar);
    for (const userAvatar of userAvatars) {
        const imgUrl = `${getThumbnailUrl('avatar', userAvatar.avatar)}`;
        const imgTitle = userAvatar.name;
        const isSelected = userAvatar === user_avatar;
        const isDefault = userAvatar === power_user.default_persona;
        const listItem = $('<li tabindex="0" class="list-group-item interactable"><img class="quickPersonaMenuImgTwo"/></li>');
        listItem.find('img').attr('src', imgUrl).attr('title', imgTitle).toggleClass('selected', isSelected).toggleClass('default', isDefault);
        listItem.on('click', () => {
            closeQuickPersonaSelector();
        //    setUserAvatar(userAvatar);
			doSendGenerateCommand(userAvatar);
            changeQuickPersona();
            retriggerFirstMessageOnEmptyChat();
        });
        quickPersonaList.find('ul').append(listItem);
    }
    quickPersonaList.hide();
    $(document.body).append(quickPersonaList);
    $('#quickPersonaCaretTwo').toggleClass('fa-caret-up fa-caret-down');
    $('#quickPersonaMenuTwo').fadeIn(animation_duration);
    popper = Popper.createPopper(document.getElementById('quickPersonaTwo'), document.getElementById('quickPersonaMenuTwo'), {
        placement: 'top-start',
    });
    popper.update();
}

function doSendGenerateCommand(userAvatar) {
	
	console.log('CharacterIDQuickGenerate: ', userAvatar.name);
	const chid = Number(findGroupMemberId(userAvatar.name));
	console.log('CharacterID: ', chid);
		if (Number.isInteger(chid)) {
			Generate('normal', { force_chid: chid });
		}
 // await eventSource.emit(event_types.GROUP_UPDATED);
}



function closeQuickPersonaSelector() {
    isOpen = false;
    $('#quickPersonaCaretTwo').toggleClass('fa-caret-up fa-caret-down');
    $('#quickPersonaMenuTwo').fadeOut(animation_duration, () => {
        $('#quickPersonaMenuTwo').remove();
    });
    popper.destroy();
}

// /img/ai4.png

function changeQuickPersona() {
    setTimeout(() => {
        const imgUrl = `/img/ai4.png`;
        const imgTitle = `Quick Generate Response`;
        $('#quickPersonaImgTwo').attr('src', imgUrl).attr('title', imgTitle);
    }, 100);
}


jQuery(() => {
    addQuickPersonaButton();
    eventSource.on(event_types.CHAT_CHANGED, changeQuickPersona);
    eventSource.on(event_types.SETTINGS_UPDATED, changeQuickPersona);
    $(document.body).on('click', (e) => {
        if (isOpen && !e.target.closest('#quickPersonaMenuTwo') && !e.target.closest('#quickPersonaTwo')) {
            closeQuickPersonaSelector();
        }
    });
    changeQuickPersona();
});

-- Écrit le sujet, le corps et les pièces jointes d'un brouillon en cours de composition.
-- Nécessaire pour les réponses natives : en JXA, l'écriture de « content » y est ignorée.
-- Script STATIQUE : toutes les valeurs arrivent par argv, jamais par insertion dans le texte.
--   argv 1 : id du message en composition
--   argv 2 : sujet ("" = conserver celui de Mail)
--   argv 3 : corps
--   argv 4… : chemins POSIX des fichiers à joindre
on run argv
	-- Les valeurs sont copiées dans des variables locales AVANT le bloc tell :
	-- à l'intérieur, « item n of argv » serait interprété comme un objet de Mail.
	set theId to (item 1 of argv) as integer
	set theSubject to (item 2 of argv) as text
	set theBody to (item 3 of argv) as text
	set theFiles to {}
	if (count of argv) > 3 then
		repeat with i from 4 to (count of argv)
			set end of theFiles to (POSIX file ((item i of argv) as text))
		end repeat
	end if

	tell application "Mail"
		set m to outgoing message id theId
		if theSubject is not "" then set subject of m to theSubject
		set content of m to theBody
		delay 0.5
		repeat with theFile in theFiles
			tell content of m
				make new attachment with properties {file name:(contents of theFile)} at after last paragraph
			end tell
			delay 0.5
		end repeat
		return (length of (content of m as text)) as text
	end tell
end run

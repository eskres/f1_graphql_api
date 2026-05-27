export function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="p-3 mt-4 mx-auto text-center text-sm text-gray-500">
            <p>Built by Einar Skreslett</p>
            <p>{year}</p>
        </footer>
    );
}
